/**
 * Minecraft Melon 服务器主页 · Cloudflare Worker 入口
 * ─────────────────────────────────────────────────────────────
 * 托管静态站点（index.html），并提供状态查询同源代理：
 *
 * /api/status —— 服务端转发 mcsrvstat.us 查询并缓存 60 秒，
 *                避免浏览器直连第三方接口的 CORS / 网络 / 限流问题。
 *                客户端下载走 GitHub Releases，无需 R2。
 *
 * 部署步骤（在本目录执行）：
 *   wrangler deploy
 */

const SERVER_HOST = 'minecraftmelon.dpdns.org';
const STATUS_API = 'https://api.mcsrvstat.us/3/' + SERVER_HOST;
const CACHE_TTL_MS = 60_000;

// 简单的 isolate 级内存缓存，降低上游接口被限流的概率
let cached = { at: 0, body: null };

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    /* ── 状态代理：同源返回 mcsrvstat 格式，浏览器端无 CORS 问题 ── */
    if (pathname === '/api/status') {
      if (cached.body && Date.now() - cached.at < CACHE_TTL_MS) {
        return new Response(cached.body, { headers: JSON_HEADERS });
      }
      try {
        const upstream = await fetch(STATUS_API, {
          headers: { 'User-Agent': 'melon-homepage-worker/1.0' },
          cf: { cacheTtl: 60, cacheEverything: true }
        });
        if (!upstream.ok) throw new Error('upstream ' + upstream.status);
        const body = JSON.stringify(await upstream.json());
        cached = { at: Date.now(), body };
        return new Response(body, { headers: JSON_HEADERS });
      } catch (e) {
        // 返回 502，让前端自动回退到直连公共接口
        return new Response(JSON.stringify({ error: 'status-upstream-failed' }), {
          status: 502,
          headers: JSON_HEADERS
        });
      }
    }

    /* ── 其余请求交给静态资产（index.html 等）── */
    return env.ASSETS.fetch(request);
  }
};
