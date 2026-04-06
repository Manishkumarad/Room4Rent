async function rollbackEcsService() {
  const cluster = process.env.AWS_ECS_CLUSTER;
  const service = process.env.AWS_ECS_SERVICE;
  const taskDefinition = process.env.PREVIOUS_TASK_DEFINITION_ARN;

  if (!cluster || !service || !taskDefinition) {
    throw new Error('AWS_ECS_CLUSTER, AWS_ECS_SERVICE, and PREVIOUS_TASK_DEFINITION_ARN are required');
  }

  const command = [
    'aws ecs update-service',
    `--cluster ${JSON.stringify(cluster)}`,
    `--service ${JSON.stringify(service)}`,
    `--task-definition ${JSON.stringify(taskDefinition)}`,
    '--force-new-deployment'
  ].join(' ');

  return { command };
}

async function main() {
  const result = await rollbackEcsService();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { rollbackEcsService };
