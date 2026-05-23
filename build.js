const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ENTRY = path.join(__dirname, "Das Tool", "_entry.js");
const OUT   = path.join(__dirname, "Das Tool", "Stromplaner.html");
const SRC   = path.join(__dirname, "Das Tool", "Stromplaner.jsx");

// Temporärer Einstiegspunkt, der die App im Browser mountet
const entryCode = `
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./Stromplaner.jsx";
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
`;

async function build() {
  fs.writeFileSync(ENTRY, entryCode);
  try {
    const result = await esbuild.build({
      entryPoints: [ENTRY],
      bundle: true,
      format: "iife",
      loader: { ".jsx": "jsx" },
      write: false,
    });

    const bundle = result.outputFiles[0].text;

    const html =
      `<!DOCTYPE html><html lang="de"><head>` +
      `<meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Stromplaner</title>` +
      `<style>html,body{margin:0;padding:0;background:#15191e;}</style>` +
      `</head><body><div id="root"></div><script>\n` +
      bundle +
      `</script></body></html>`;

    fs.writeFileSync(OUT, html);
    console.log("Build erfolgreich: Das Tool/Stromplaner.html");
  } finally {
    if (fs.existsSync(ENTRY)) fs.unlinkSync(ENTRY);
  }
}

build().catch((e) => {
  console.error("Build fehlgeschlagen:", e.message);
  process.exit(1);
});
