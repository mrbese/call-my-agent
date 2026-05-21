const configSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const plugin = {
  id: "call-my-agent",
  name: "Call My Agent",
  description:
    "Packages the local Call My Agent voice app and its setup skill for audited ClawHub distribution.",
  configSchema,
};

export default plugin;
