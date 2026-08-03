const openapiSpec = await Bun.file("./openapi.yaml").text();

const docsPage = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Document Vault — API docs</title>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.yaml"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export function spec() {
  return new Response(openapiSpec, {
    headers: { "content-type": "application/yaml" },
  });
}

export function docs() {
  return new Response(docsPage, {
    headers: { "content-type": "text/html" },
  });
}
