import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const app = express();
const port = process.env.PORT;

// middleware
app.use(express.json());
app.use(cors());

// MongoDB
const client = new MongoClient(process.env.MONGODB_URL);


export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectedClient = await connectToMongoDB();
const database = connectedClient.db("HireLoop");
const userCollection = database.collection("user");

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/users', async (req, res) => {
    const cursor = userCollection.find({});
    const result = await cursor.toArray();
    res.send(result);
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

export default app;