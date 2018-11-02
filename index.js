const fs = require("fs");
const path = require("path");
const pify = require("pify");
const globby = require("globby");
const chalk = require("chalk");
const transformImports = require("transform-imports");
const resolve = require("resolve");

const fsp = pify(fs);
const resolvep = pify(resolve);

const targets = require("yargs")
  .usage("$0 [file-glob-patterns]")
  .example("$0 'src/**/*.index.js' '!node_modules'").argv._;

if (targets.length === 0) {
  console.log(
    chalk`Please specify a file glob to search over; for instance:\n{blue popularity-contest} {yellow 'src/**/*.js' '!node_modules'}`
  );
  process.exit(1);
}

const counts = {};

const addCount = (moduleId, importName) => {
  const symbol = importName === "*" ? "" : " - " + chalk.magenta(importName);
  const key = path.relative(process.cwd(), moduleId) + symbol;
  if (counts[key] == null) {
    counts[key] = 1;
  } else {
    counts[key] += 1;
  }
};

function logCounts() {
  Object.entries(counts)
    .sort(([key1, value1], [key2, value2]) => {
      return value1 - value2;
    })
    .forEach(([moduleId, amount]) => {
      const displayId = moduleId.replace(
        /(^node_modules\/)([\w-.]*)(\/.*)/,
        (match, group1, group2, group3) => {
          return chalk.grey(group1) + group2 + chalk.grey(group3);
        }
      );
      console.log(chalk`{blue ${amount}} {grey :} ${displayId}`);
    });
}

async function main() {
  console.error("Resolving file glob...");

  const files = await globby(targets);

  console.error(chalk`Found {magenta ${files.length}} files.`);
  if (!targets.includes("!node_modules")) {
    console.error(
      chalk`{grey If this is more files than you expected, {bold you may want to ignore node_modules}. You can do so like so:}`
    );
    console.error(
      chalk`  {blue popularity-contest} {yellow ${targets
        .map(JSON.stringify.bind(JSON))
        .join(" ")} "!node_modules"}`
    );
  }

  for (let file of files) {
    console.error(chalk.grey(`Parsing '${file}'... `));

    const content = await fsp.readFile(file, "utf-8");

    try {
      transformImports(content, (importDefs) => {
        importDefs.forEach(async (def) => {
          const name = await resolvep(def.source, {
            basedir: path.dirname(file)
          });
          addCount(name, def.importedExport.name);
        });
      });
    } catch (err) {
      console.error(chalk.yellow(`Failed to parse '${file}'; skipping`));
    }
  }

  logCounts();
}

main().catch((error) => {
  console.error(chalk.red(error.stack));
  process.exit(1);
});

process.on("SIGINT", () => {
  console.error(chalk.red("Exiting early; partial results shown."));
  logCounts();
  process.exit(1);
});
