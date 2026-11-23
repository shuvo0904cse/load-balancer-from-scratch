import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const servers = [
  { name: 'Server 1', url: 'http://localhost:3001', weight: 5, connections: 0 },
  { name: 'Server 2', url: 'http://localhost:3002', weight: 3, connections: 0 },
  { name: 'Server 3', url: 'http://localhost:3003', weight: 1, connections: 0 },
  { name: 'Server 4', url: 'http://localhost:3004', weight: 0, connections: 0 },
  { name: 'Server 5', url: 'http://localhost:3005', weight: 0, connections: 0 }
];

const ALGORITHM = 'ipHash'; // Change this to 'roundRobin', 'weightedRoundRobin', 'random', 'leastConnections', or 'ipHash' to switch algorithms

//Round Robin Load Balancing
let roundRobinIndex = 0;
const roundRobin = () => {
  const server = servers[roundRobinIndex];
  roundRobinIndex++;
  if(roundRobinIndex === servers.length) {
    roundRobinIndex = 0;
  }
  return server;
};

//Weighted Round Robin Load Balancing
let weightedLists = [];
let weightedIndex = 0;
for (const server of servers) { 
  for (let i = 0; i < server.weight; i++) {
    weightedLists.push(server);
  }
}

const weightedRoundRobin = () => {
  const server = weightedLists[weightedIndex];
  weightedIndex++;
  if(weightedIndex === weightedLists.length) {
    weightedIndex = 0;
  }
  return server;
};

//random Load Balancing
const random = () => {
  const randomIndex = Math.floor(Math.random() * servers.length);
  return servers[randomIndex];
};

//Least Connections Load Balancing
const leastConnections = () => {
  let best = servers[0];
  
  for (const server of servers) {
    if (server.connections < best.connections) {
      best = server;
    }
  }
  return best;
};

//Ip hash Load Balancing
const ipHash = (ip) => {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash += ip.charCodeAt(i);
  }
  const index = hash % servers.length;
  return servers[index];
};

const chooseServer = (req) => {
  switch (ALGORITHM) {
    case 'roundRobin':
      return roundRobin();
    case 'weightedRoundRobin':
      return weightedRoundRobin();
    case 'random':
      return random();
    case 'leastConnections':
      return leastConnections();
    case 'ipHash':
      return ipHash(req.ip);
    default:
      return leastConnections();
  }
};

for (const server of servers) {
  server.proxy = createProxyMiddleware({
    target: server.url,
    changeOrigin: true
  });
}

app.use((req, res, next) => {
  const server = chooseServer(req);

  // Least Connections Load Balancing: Increment the connection count for the chosen server
  if (ALGORITHM === 'leastConnections') {
    server.connections++;

    res.on('close', () => {
      server.connections--;
    });
  }

  server.proxy(req, res, next);
});

app.listen(3000, () => {
  console.log('Load balancer is running on port 3000');
});
