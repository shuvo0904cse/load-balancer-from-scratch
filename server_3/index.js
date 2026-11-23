import express from 'express';

const app = express();

app.get('/test', (req, res) => {
  res.send('Hello from server 3!');
});

app.listen(3003, () => {
  console.log('Server 3 is running on port 3003');
});