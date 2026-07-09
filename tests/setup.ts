// Global test setup: quiet structured logs unless a test opts in.
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "error";
process.env.LOG_FORMAT = process.env.LOG_FORMAT ?? "json";
