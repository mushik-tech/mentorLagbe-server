import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";

import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export const startServer = async () => {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    app.listen(port, () => {
      console.log(`MentorLagbe listening on port ${port}`);
    });
    return client;
  } catch (err) {
    console.dir(err);
  }
};

const connectedClient = await startServer();

const db = connectedClient.db(process.env.DB_NAME);
const usersCollection = db.collection("user");
const tuitionsCollection = db.collection("tutions");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/users", async (req, res) => {
  const cursor = usersCollection.find();
  const users = await cursor.toArray();
  res.status(200).json(users);
});

app.patch("/users/:email/role", async (req, res) => {
  const email = req.params.email;
  const updateData = req.body;
  const updatedDoc = {
    $set: {
      role: updateData.role,
    },
  };
  const result = await usersCollection.updateOne({ email }, updatedDoc);
  res.status(200).json(result);
});

app.get("/tuitions", async (req, res) => {
  const cursor = tuitionsCollection.find();
  const tuitions = await cursor.toArray();
  res.status(200).json(tuitions);
});

app.post("/tuitions", async (req, res) => {
  const tuition = req.body;
  tuition.createdAt = new Date();
  tuition.isActive = true;
  tuition.approvalStatus = "pending";
  const result = await tuitionsCollection.insertOne(tuition);
  res.status(201).json(result);
});

app.patch("/tuitions/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const filter = {
    _id: new ObjectId(id),
  };
  const updatedDoc = {
    $set: {
      approvalStatus: status,
    },
  };

  const result = await tuitionsCollection.updateOne(filter, updatedDoc);

  res.status(200).json(result);
});
