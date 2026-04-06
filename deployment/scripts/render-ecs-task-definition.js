const fs = require('node:fs');
const path = require('node:path');

function replacePlaceholders(value, envMap) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(envMap, key)) {
        return envMap[key];
      }
      return match;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => replacePlaceholders(item, envMap));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, envMap)])
    );
  }

  return value;
}

async function renderTaskDefinition({ templatePath, outputPath, envMap }) {
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const rendered = replacePlaceholders(template, envMap);
  fs.writeFileSync(outputPath, JSON.stringify(rendered, null, 2));
  return outputPath;
}

async function main() {
  const templatePath = process.env.TASK_DEFINITION_TEMPLATE;
  const outputPath = process.env.TASK_DEFINITION_OUTPUT || path.resolve(process.cwd(), 'deployment/aws/ecs-task-definition.rendered.json');

  if (!templatePath) {
    throw new Error('TASK_DEFINITION_TEMPLATE is required');
  }

  const envMap = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => key === key.toUpperCase() && typeof value === 'string' && value.length > 0)
  );

  const renderedPath = await renderTaskDefinition({ templatePath, outputPath, envMap });
  console.log(renderedPath);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { renderTaskDefinition };
