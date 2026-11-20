import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

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

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/users", async (req, res) => {
  const cursor = usersCollection.find();
  const users = await cursor.toArray();
  res.send(users);
});
