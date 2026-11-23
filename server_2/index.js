import express from 'express';

const app = express();

app.get('/test', (req, res) => {
  res.send('Hello from server 2!');
});

app.listen(3002, () => {
  console.log('Server 2 is running on port 3002');
});