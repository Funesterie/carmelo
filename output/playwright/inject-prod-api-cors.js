async function(page) {
  await page.context().route("https://api.funesterie.pro/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:4173",
          "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": "Authorization,Content-Type,X-Casino-Tab-Id",
          "access-control-allow-credentials": "true"
        },
        body: ""
      });
      return;
    }

    const upstreamHeaders = { ...request.headers() };
    delete upstreamHeaders.origin;
    delete upstreamHeaders.Origin;

    const response = await route.fetch({
      headers: upstreamHeaders
    });
    const headers = {
      ...response.headers(),
      "access-control-allow-origin": "http://127.0.0.1:4173",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "Authorization,Content-Type,X-Casino-Tab-Id",
      "access-control-allow-credentials": "true"
    };

    await route.fulfill({ response, headers });
  });
}
