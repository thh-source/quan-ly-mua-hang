import { readFileSync, writeFileSync } from "node:fs";

const configPath = "dist/server/wrangler.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));

config.name = process.env.CLOUDFLARE_WORKER_NAME || process.env.WORKER_NAME || "mh";
config.topLevelName = config.name;
config.compatibility_flags = (config.compatibility_flags || []).filter(
  (flag, index, flags) =>
    flag !== "nodejs_compat" && flags.indexOf(flag) === index,
);

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `Patched ${configPath}: name=${config.name}, compatibility_flags=${JSON.stringify(
    config.compatibility_flags,
  )}`,
);
