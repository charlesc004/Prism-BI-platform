export function parseRedisConnection(value: string) {
  const address = new URL(value);
  const port = Number(address.port || 6379);
  const database = Number(address.pathname.slice(1) || 0);
  if (
    !Number.isInteger(database) ||
    database < 0 ||
    !Number.isInteger(port) ||
    port < 1
  )
    throw new Error(
      "Redis requires a valid port and non-negative database index",
    );
  return {
    host: address.hostname,
    port,
    username: address.username
      ? decodeURIComponent(address.username)
      : undefined,
    password: address.password
      ? decodeURIComponent(address.password)
      : undefined,
    db: database,
    ...(address.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
