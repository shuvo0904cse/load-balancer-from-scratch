import express from 'express';

const app = express();

app.get('/test', (req, res) => {
  res.send('Hello from server 1!');
});

app.listen(3001, () => {
  console.log('Server 1 is running on port 3001');
});