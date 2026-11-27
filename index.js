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
const applicationsCollection = database.collection("applications");

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
    const query = {};
    if (req.query) {
      if (req.query.jobType) {
        query.jobType = req.query.jobType;
      };
      if (req.query.remoteAllowed) {
        query.remoteAllowed = req.query.remoteAllowed === 'true';     
      };
      if (req.query.category){
        query.jobCategory = req.query.category;
      };
      if (req.query.search) {
        const search = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
          {jobTitle: {$regex: search, $options: 'i'}},
          {companyName: {$regex: search, $options: 'i'}},
          {jobLocation: {$regex: search, $options: 'i'}},
          {responsibilities: {$regex: search, $options: 'i'}},
          {qualifications: {$regex: search, $options: 'i'}},
        ]
      }
    }

    // sort: newest first by default, or oldest / highest salary
    let sortSpec = { postedAt: -1 };
    if (req.query.sort === 'oldest') sortSpec = { postedAt: 1 };
    if (req.query.sort === 'salary') sortSpec = { maxSalary: -1 };

    const cursor = jobsCollection.find(query).sort(sortSpec);
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

// get single job by id
app.get("/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid job id" });
    }

    const job = await jobsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!job) {
      return res.status(404).send({ error: "Job not found" });
    }

    res.send(job);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch job" });
  }
});

// update job api
app.put("/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid job id" });
    }

    const updatedJob = {
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
    };

    const result = await jobsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedJob }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ error: "Job not found" });
    }

    res.send({
      message: "Job updated successfully",
      result,
    });

  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to update job" });
  }
});

// get seeker applications, stats, and recent activities
app.get("/applications/seeker", async (req, res) => {
  try {
    const { userId, userEmail } = req.query;

    if (!userId && !userEmail) {
      return res.status(400).send({ error: "userId or userEmail is required" });
    }

    const identityFilters = [];
    if (userId) identityFilters.push({ userId: String(userId) });
    if (userEmail) {
      identityFilters.push({ userEmail: String(userEmail).trim().toLowerCase() });
    }

    const rawApps = await applicationsCollection
      .find({ $or: identityFilters })
      .sort({ appliedAt: -1 })
      .toArray();

    const jobObjectIds = rawApps
      .map((app) => app.jobId)
      .filter((id) => ObjectId.isValid(String(id)))
      .map((id) => new ObjectId(String(id)));

    const jobs = jobObjectIds.length
      ? await jobsCollection.find({ _id: { $in: jobObjectIds } }).toArray()
      : [];

    const jobMap = new Map(jobs.map((j) => [String(j._id), j]));

    const applications = rawApps.map((app) => {
      const job = jobMap.get(String(app.jobId));
      return {
        _id: String(app._id),
        jobId: String(app.jobId),
        jobTitle: job?.jobTitle ?? "Unknown Position",
        companyName: job?.companyName ?? "Unknown Company",
        jobType: job?.jobType ?? "Full-time",
        jobLocation: job?.jobLocation ?? "",
        remoteAllowed: Boolean(job?.remoteAllowed),
        jobCategory: job?.jobCategory ?? null,
        status: app.status ?? "Applied",
        appliedAt: app.appliedAt,
        archived: Boolean(app.archived),
      };
    });

    const totalApplied = applications.length;
    const shortlisted = applications.filter(
      (a) => a.status.toLowerCase() === "shortlisted"
    ).length;
    const interviews = applications.filter((a) =>
      ["interview", "interviewing"].includes(a.status.toLowerCase())
    ).length;
    const offers = applications.filter((a) =>
      ["offered", "offer"].includes(a.status.toLowerCase())
    ).length;
    const positiveOutcomes = shortlisted + interviews + offers;
    const successRate =
      totalApplied > 0 ? Math.round((positiveOutcomes / totalApplied) * 100) : 0;

    // Build recent activities from applications + latest active jobs
    const appActivities = applications.slice(0, 4).map((app) => ({
      id: `app-${app._id}`,
      type: "status",
      role: app.jobTitle,
      company: app.companyName,
      statusText: app.status === "Pending" ? "Applied" : app.status,
      timestamp: app.appliedAt,
      jobId: app.jobId,
    }));

    const latestJobs = await jobsCollection
      .find({ status: { $ne: "Expired" } })
      .sort({ postedAt: -1 })
      .limit(2)
      .toArray();

    const jobAlerts = latestJobs.map((job) => ({
      id: `alert-${String(job._id)}`,
      type: "alert",
      role: job.jobTitle,
      company: job.companyName,
      timestamp: job.postedAt,
      jobId: String(job._id),
    }));

    const activities = [...appActivities, ...jobAlerts].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    res.send({
      stats: {
        savedJobs: 0,
        totalApplied,
        shortlisted,
        interviews,
        offers,
        successRate,
      },
      applications,
      activities,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch seeker applications" });
  }
});

// check if user already applied for a job
app.get("/applications/check", async (req, res) => {
  try {
    const { jobId, userId, userEmail } = req.query;
    if (!jobId || (!userId && !userEmail)) {
      return res.send({ applied: false });
    }

    const identityFilters = [];
    if (userId) identityFilters.push({ userId: String(userId) });
    if (userEmail) {
      identityFilters.push({ userEmail: String(userEmail).trim().toLowerCase() });
    }

    const existing = await applicationsCollection.findOne({
      jobId: String(jobId),
      $or: identityFilters,
    });

    res.send({ applied: Boolean(existing) });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to check application" });
  }
});

// apply for a job
app.post("/applications", async (req, res) => {
  try {
    const { jobId, userId, userEmail, userName } = req.body;

    if (!jobId || !ObjectId.isValid(String(jobId))) {
      return res.status(400).send({ error: "Invalid job id" });
    }

    if (!userId && !userEmail) {
      return res.status(401).send({ error: "User authentication is required" });
    }

    const job = await jobsCollection.findOne({ _id: new ObjectId(String(jobId)) });
    if (!job) {
      return res.status(404).send({ error: "Job not found" });
    }

    const normalizedEmail = userEmail ? String(userEmail).trim().toLowerCase() : null;
    const normalizedUserId = userId ? String(userId) : null;

    const identityFilters = [];
    if (normalizedUserId) identityFilters.push({ userId: normalizedUserId });
    if (normalizedEmail) identityFilters.push({ userEmail: normalizedEmail });

    const existing = await applicationsCollection.findOne({
      jobId: String(jobId),
      $or: identityFilters,
    });

    if (existing) {
      return res.status(409).send({ error: "You have already applied for this job" });
    }

    const application = {
      jobId: String(jobId),
      userId: normalizedUserId,
      userEmail: normalizedEmail,
      userName: userName ? String(userName).trim() : null,
      status: "Pending",
      appliedAt: new Date(),
    };

    const result = await applicationsCollection.insertOne(application);
    await jobsCollection.updateOne(
      { _id: new ObjectId(String(jobId)) },
      { $inc: { applicants: 1 } }
    );

    res.status(201).send({
      message: "Application submitted successfully",
      applicationId: result.insertedId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to submit application" });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

export default app;