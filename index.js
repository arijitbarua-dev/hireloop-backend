import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
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
const jobsCollection = database.collection("jobs");

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// user api
app.get('/users', async (req, res) => {
    const cursor = userCollection.find({});
    const result = await cursor.toArray();
    res.send(result);
})


// get all jobs api
app.get('/jobs', async (req, res) => {
  try {
    const cursor = jobsCollection.find({}).sort({ postedAt: -1 });
    const result = await cursor.toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to fetch jobs' });
  }
})

// add job api
app.post("/jobs", async (req, res) => {
  try {
    const body = req.body;

    // basic validation
    const requiredFields = [
      "jobTitle",
      "companyName",
      "jobCategory",
      "jobType",
      "jobLocation",
      "deadline",
      "responsibilities",
      "qualifications",
    ];

    for (const field of requiredFields) {
      if (!body[field]) {
        return res.status(400).send({ error: `Missing field: ${field}` });
      }
    }

    // normalize types so MongoDB stores clean data
    const job = {
      jobTitle: String(body.jobTitle).trim(),
      companyName: String(body.companyName).trim(),
      jobCategory: body.jobCategory,
      jobType: body.jobType,
      remoteAllowed: Boolean(body.remoteAllowed),
      jobLocation: String(body.jobLocation).trim(),
      deadline: new Date(body.deadline),
      minSalary: Number(body.minSalary) || 0,
      maxSalary: Number(body.maxSalary) || 0,
      frequency: body.frequency,
      responsibilities: body.responsibilities,
      qualifications: body.qualifications,
      status: "Active",
      applicants: 0,
      postedAt: new Date(),
    };

    const result = await jobsCollection.insertOne(job);
    res.status(201).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to create job" });
  }
})

// delete job api
app.delete("/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid job id" });
    }

    const result = await jobsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).send({ error: "Job not found" });
    }

    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to delete job" });
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

export default app;