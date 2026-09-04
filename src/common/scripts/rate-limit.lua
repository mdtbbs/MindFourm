-- Atomic rate limiting with single Lua script
-- KEYS[1] = rate limit key
-- ARGV[1] = TTL in seconds
-- ARGV[2] = max requests

local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current