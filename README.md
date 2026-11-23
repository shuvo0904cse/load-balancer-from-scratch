# Load Balancer (Node.js + Express)

A small learning project that builds an HTTP load balancer from scratch and compares five common load-balancing algorithms:

- Round Robin
- Weighted Round Robin
- Random
- Least Connections
- IP Hash

One load balancer listens on port **3000** and forwards each incoming request to one of five backend servers (ports **3001–3005**). Which server it picks depends on the selected algorithm.

```
                       ┌──────────────► Server 1  :3001
                       ├──────────────► Server 2  :3002
 client ──► Load Balancer :3000 ───────► Server 3  :3003
                       ├──────────────► Server 4  :3004
                       └──────────────► Server 5  :3005
```

---

## Project structure

```
load_balancer_new/
├── load_balancer/        # The load balancer (port 3000)
│   ├── index.js          # Algorithms + proxy logic
│   └── package.json      # express, http-proxy-middleware
├── server_1/             # Backend server (port 3001)
│   └── index.js
├── server_2/             # Backend server (port 3002)
├── server_3/             # Backend server (port 3003)
├── server_4/             # Backend server (port 3004)
└── server_5/             # Backend server (port 3005)
```

Each backend server is a minimal Express app with a single route:

```
GET /test  →  "Hello from server N!"
```

The response text tells you which server handled the request, so you can see the load balancer's choice.

---

## Requirements

- Node.js **18.11 or newer** (needed for `node --watch`; check with `node -v`)
- npm

---

## Setup

Install dependencies in **every** folder (run this once):

```bash
cd load_balancer && npm install && cd ..
for s in server_1 server_2 server_3 server_4 server_5; do (cd $s && npm install); done
```

---

## Running

You need **6 processes**: 5 backend servers and the load balancer. Open 6 terminals and run one command in each:

```bash
cd server_1 && node --watch index.js
cd server_2 && node --watch index.js
cd server_3 && node --watch index.js
cd server_4 && node --watch index.js
cd server_5 && node --watch index.js
cd load_balancer && node --watch index.js
```

`--watch` restarts the process automatically when you save a file.

> **Run only one process per folder.** If two terminals run the same folder, both try to use the same port. One crashes with `EADDRINUSE` and requests may fail with `Couldn't connect to server`. To see what is running:
>
> ```bash
> for p in $(pgrep -f "node --watch"); do echo "$p $(lsof -a -p $p -d cwd -Fn | grep ^n | cut -c2-)"; done
> ```
>
> Then stop the extra ones with `kill <PID>`.

---

## Testing

Send one request:

```bash
curl http://localhost:3000/test
```

Send 10 requests **one after another** (sequential):

```bash
for i in {1..10}; do curl -s http://localhost:3000/test; echo; done
```

Send 10 requests **at the same time** (concurrent):

```bash
for i in {1..10}; do (curl -s http://localhost:3000/test; echo) & done; wait
```

`&` runs each `curl` in the background so they don't wait for each other, and `wait` holds the prompt until all of them finish.

---

## Choosing an algorithm

Open [load_balancer/index.js](load_balancer/index.js) and change the `ALGORITHM` constant:

```js
const ALGORITHM = 'roundRobin';
// 'roundRobin' | 'weightedRoundRobin' | 'random' | 'leastConnections' | 'ipHash'
```

Save the file. `--watch` restarts the load balancer with the new algorithm.

Each server is defined in the `servers` array:

```js
{ name: 'Server 1', url: 'http://localhost:3001', weight: 5, connections: 0 }
```

- `weight` is used only by Weighted Round Robin.
- `connections` is used only by Least Connections.

---

## How the load balancer works

1. **Startup:** for each server in `servers`, a proxy is created once with `createProxyMiddleware({ target: server.url })` and stored as `server.proxy`.
2. **Each request:**
   - `chooseServer(req)` picks a server using the selected algorithm.
   - With Least Connections, the server's `connections` count goes up by 1, and goes back down when the response closes (`res.on('close')`).
   - `server.proxy(req, res, next)` forwards the request to that server and streams the response back to the client.

---

## The algorithms

### 1. Round Robin

Sends requests to the servers in order and starts over after the last one.

```
Request:  1   2   3   4   5   6   7 ...
Server:   1   2   3   4   5   1   2 ...
```

An index points to the next server. After each request it increases by 1 and wraps back to 0 at the end of the list.

**Good for:** servers with the same capacity.
**Expected result:** sequential requests cycle through 1 → 2 → 3 → 4 → 5 → 1 …

---

### 2. Weighted Round Robin

Like Round Robin, but a server with a larger `weight` gets proportionally more requests.

At startup, the code builds `weightedLists` by adding each server to the list as many times as its weight:

```js
for (const server of servers) {
  for (let i = 0; i < server.weight; i++) {
    weightedLists.push(server);
  }
}
```

With the current weights (5, 3, 1, 0, 0) the list is:

```
[S1, S1, S1, S1, S1, S2, S2, S2, S3]   // 9 entries
```

Round Robin then runs over this list. Out of every 9 requests:

| Server   | Weight | Requests |
|----------|--------|----------|
| Server 1 | 5      | 5        |
| Server 2 | 3      | 3        |
| Server 3 | 1      | 1        |
| Server 4 | 0      | 0        |
| Server 5 | 0      | 0        |

**Good for:** servers with different capacity (give the stronger machine a higher weight).

**Notes:**
- A server with `weight: 0` never receives traffic.
- If **all** weights are 0, the list is empty and the load balancer crashes. Give at least one server a weight of 1 or more.
- In this simple version the same server gets several requests in a row (S1, S1, S1, …). Production load balancers such as Nginx use *smooth* weighted round robin to interleave them, for example S1, S2, S1, S3, S1, ….

---

### 3. Random

Picks a random server for each request:

```js
Math.floor(Math.random() * servers.length)
```

**Good for:** quick, stateless distribution. Over many requests each server gets roughly an equal share, but short runs can be uneven.

---

### 4. Least Connections

Sends each request to the server with the **fewest active (in-progress) requests**.

- When a request is forwarded, that server's `connections` goes up by 1.
- When the response closes, it goes down by 1.
- `leastConnections()` returns the server with the lowest count. If several servers tie, it picks the first of them.

**Good for:** requests that take different amounts of time, such as long-running jobs mixed with quick ones.

**Why you might only see Server 1:**
If you send requests **one after another** and each one finishes instantly, every server is back to 0 connections before the next request arrives. All servers tie, so Server 1 is always chosen. This is the correct behavior: with no load, the first idle server is picked.

**To see the difference:**
1. Make the backend respond slowly. For example, in a server's `/test` route, wrap `res.send(...)` in `setTimeout(..., 3000)`.
2. Send requests **concurrently** (see [Testing](#testing)).

Requests then spread out: 1 → 2 → 3 → 4 → 5 → 1 … because each busy server has a higher count than the idle ones.

---

### 5. IP Hash

Turns the client's IP address into a number and maps it to a server:

```js
hash = sum of the character codes of the IP string
index = hash % servers.length
```

The same IP always gives the same hash, so **the same client always reaches the same server** (a "sticky session"). This is useful when a server keeps per-user state in memory.

**Expected result:** every request from your own machine goes to the **same** server. This is the intended behavior, not a bug.

**Note on localhost:** on your own machine `req.ip` is an IPv6 value such as `::1` or `::ffff:127.0.0.1`, not `127.0.0.1`. The hash works on the IP as a string (character codes), so it handles both IPv4 and IPv6. An earlier version used `ip.split('.')` with `parseInt`, which produced `NaN` for IPv6 addresses and crashed with `Cannot read properties of undefined (reading 'proxy')`.

**To simulate different clients**, change `ipHash(req.ip)` in `chooseServer` to:

```js
ipHash(req.headers['x-forwarded-for'] || req.ip)
```

Then send a fake client IP in the header:

```bash
curl -H "X-Forwarded-For: 10.0.0.1" http://localhost:3000/test
curl -H "X-Forwarded-For: 10.0.0.2" http://localhost:3000/test
curl -H "X-Forwarded-For: 10.0.0.3" http://localhost:3000/test
```

Different IPs may go to different servers, but repeating the same IP always reaches the same server.

---

## Algorithm comparison

| Algorithm            | Uses state          | Handles unequal servers | Sticky per client | Best when                                   |
|----------------------|---------------------|-------------------------|-------------------|---------------------------------------------|
| Round Robin          | index               | No                      | No                | Servers are identical                       |
| Weighted Round Robin | index + weights     | Yes                     | No                | Servers have different capacity             |
| Random               | none                | No                      | No                | Simple, stateless spreading                 |
| Least Connections    | live request counts | Partly                  | No                | Request durations vary a lot                |
| IP Hash              | none (hash only)    | No                      | **Yes**           | A client must keep hitting the same server  |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl: (7) Couldn't connect to server` | The load balancer is not running, or it crashed while restarting | Check its terminal. If it shows `Waiting for file changes before restarting...`, fix the error and save again. |
| `EADDRINUSE: address already in use :::3000` | Another process already uses the port, often a second terminal running the same folder | Keep one process per folder and `kill` the others. |
| `Error occurred while trying to proxy` | The chosen backend server is not running | Start that server. There are no health checks, so stopped servers still get their turn. |
| `Cannot GET /test` from the load balancer | The load balancer is not forwarding (no proxy call) | Make sure `server.proxy(req, res, next)` runs inside `app.use`. |
| `curl` hangs with no response | The request handler never sends a response or calls the proxy | Every request must reach `res.send(...)` or `server.proxy(...)`. |
| `Cannot read properties of undefined (reading 'proxy')` | The algorithm returned `undefined`, for example a `NaN` index or an empty weighted list | Check the algorithm's index calculation and weights. |
| Least Connections always picks Server 1 | Requests are sequential and finish instantly, so all counts tie at 0 | Add a delay on the backend and send requests concurrently. |
| IP Hash always picks the same server | Expected: every request comes from the same IP | Use the `X-Forwarded-For` trick above. |

---

## Limitations and next steps

This is an educational implementation. Ideas to extend it:

- **Health checks:** periodically ping each server and skip the ones that are down.
- **Smooth weighted round robin:** interleave servers instead of sending bursts to one.
- **Consistent hashing:** with plain IP hashing, adding or removing a server remaps most clients. Consistent hashing remaps only a small share.
- **Config from environment:** read the algorithm and server list from environment variables instead of editing the code.
- **Retries:** if a server fails, retry the request on another one.
