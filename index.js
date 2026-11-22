import express from "express";
import cors from "cors";
import Stripe from "stripe";
import { MongoClient, ObjectId } from "mongodb";

import dotenv from "dotenv";
import { createRemoteJWKSet, jwtVerify } from "jose";
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
const applicationsCollection = db.collection("applications");
const paymentCollection = db.collection("payments");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`),
  );

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Server error" });
  }
};

const verifyAdmin = async (req, res, next) => {
  if (req.user.role !== "admin") {
    res.status(403).send({ message: "Forbidden" });
    return;
  }
  next();
};

const verifyTutor = async (req, res, next) => {
  if (req.user.role !== "tutor") {
    res.status(403).send({ message: "Forbidden" });
    return;
  }
  next();
};
const verifyStudent = async (req, res, next) => {
  if (req.user.role !== "student") {
    res.status(403).send({ message: "Forbidden" });
    return;
  }
  next();
};

app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  const cursor = usersCollection.find();
  const users = await cursor.toArray();
  res.status(200).json(users);
});

app.patch("/users/:email/role", verifyToken, verifyAdmin, async (req, res) => {
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

app.get("/featured-tuitions", async (req, res) => {
  const query = {
    isActive: true,
    approvalStatus: "approved",
  };

  const cursor = tuitionsCollection
    .find(query)
    .sort({ createdAt: -1 })
    .limit(6);

  const result = await cursor.toArray();

  res.status(200).json(result);
});

app.get("/public-tuitions", async (req, res) => {
  let query = {
    isActive: true,
    approvalStatus: "approved",
  };

  if (req.query.level) {
    query.classLevel = req.query.level;
  }
  if (req.query.mode) {
    query.mode = req.query.mode;
  }

  if (req.query.search) {
    query = {
      $or: [
        { title: { $regex: req.query.search, $options: "i" } },
        { subject: { $regex: req.query.search, $options: "i" } },
      ],
    };
  }

  const cursor = tuitionsCollection.find(query).sort({ createdAt: -1 });
  const tuitions = await cursor.toArray();
  res.status(200).json(tuitions);
});

app.get("/tuitions", verifyToken, async (req, res) => {
  let query = {};

  if (req.user.role === "student") {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  if (req.query.tutorEmail) {
    if (req.user.email !== req.query.tutorEmail) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    query.tutorEmail = req.query.tutorEmail;
  }

  const cursor = tuitionsCollection.find(query).sort({ createdAt: -1 });
  const tuitions = await cursor.toArray();
  res.status(200).json(tuitions);
});

app.get("/tuitions/:id", async (req, res) => {
  const { id } = req.params;
  const result = await tuitionsCollection.findOne({ _id: new ObjectId(id) });
  res.status(200).json(result);
});

app.get(
  "/tuitions/:email/count",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    const { email } = req.params;

    const count = await tuitionsCollection.countDocuments({
      tutorEmail: email,
    });

    res.status(200).json({ count });
  },
);

app.post("/tuitions", verifyToken, verifyTutor, async (req, res) => {
  const tuition = req.body;
  tuition.createdAt = new Date();
  tuition.isActive = true;
  tuition.approvalStatus = "pending";
  const result = await tuitionsCollection.insertOne(tuition);
  res.status(201).json(result);
});

app.patch(
  "/tuitions/:id/status",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
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
  },
);

app.patch(
  "/tuitions/:id/active",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body;

    const filter = {
      _id: new ObjectId(id),
    };
    const updatedDoc = {
      $set: {
        isActive: !isActive,
      },
    };

    const result = await tuitionsCollection.updateOne(filter, updatedDoc);

    res.status(200).json(result);
  },
);

app.patch("/tuitions/:id", verifyToken, verifyTutor, async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  const filter = {
    _id: new ObjectId(id),
  };
  const updatedDoc = {
    $set: data,
  };

  const result = await tuitionsCollection.updateOne(filter, updatedDoc);

  res.status(200).json(result);
});

app.delete("/tuitions/:id", verifyToken, verifyTutor, async (req, res) => {
  const { id } = req.params;
  const result = await tuitionsCollection.deleteOne({ _id: new ObjectId(id) });
  res.status(200).json(result);
});

app.get("/applications", verifyToken, async (req, res) => {
  let query = {};

  if (req.user.role === "admin") {
    res.status(403).json({ message: "Forbidden" });
  }

  if (req.query.studentEmail) {
    if (req.user.email !== req.query.studentEmail) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    query.studentEmail = req.query.studentEmail;
  }

  if (req.query.tutorEmail) {
    if (req.user.email !== req.query.tutorEmail) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    query.tutorEmail = req.query.tutorEmail;
  }

  const cursor = applicationsCollection.find(query);
  const applications = await cursor.toArray();
  res.status(200).json(applications);
});

app.get(
  "/applications/:email/count",
  verifyToken,
  verifyStudent,
  async (req, res) => {
    const { email } = req.params;

    const count = await applicationsCollection.countDocuments({
      studentEmail: email,
    });

    res.status(200).json({ count });
  },
);

app.post("/applications", verifyToken, verifyStudent, async (req, res) => {
  const application = req.body;
  application.appliedAt = new Date();
  application.status = "pending";

  const isExistQuery = {
    tuitionId: application.tuitionId,
    studentEmail: application.studentEmail,
  };

  const isExist = await applicationsCollection.findOne(isExistQuery);

  if (isExist) {
    res.status(409).json({ message: "Already applied" });
    return;
  }

  const result = await applicationsCollection.insertOne(application);
  res.status(201).json(result);
});

app.patch(
  "/applications/:id/status",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const filter = {
      _id: new ObjectId(id),
    };
    const updatedDoc = {
      $set: {
        status: status,
      },
    };

    const result = await applicationsCollection.updateOne(filter, updatedDoc);

    res.status(200).json(result);
  },
);

app.delete(
  "/applications/:id",
  verifyToken,
  verifyStudent,
  async (req, res) => {
    const { id } = req.params;
    const result = await applicationsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.status(200).json(result);
  },
);

app.post("/payments", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.json({ success: false, message: "Session ID is required" });
  }

  const {
    customer_email,
    metadata,
    amount_total,
    currency,
    payment_intent,
    status,
    payment_status,
  } = await stripe.checkout.sessions.retrieve(sessionId);

  if (status === "complete" && payment_status === "paid") {
    const sessionQuery = { stripeSessionId: sessionId };

    const isExistPayment = await paymentCollection.findOne(sessionQuery);

    if (isExistPayment) {
      return res.json({ success: false, message: "Payment already verified" });
    }

    const paymentInfo = {
      userEmail: customer_email,
      userName: metadata.userName,
      userRole: metadata.userRole,
      planName: metadata.planName,
      amount: amount_total / 100,
      currency: currency,
      transactionId: payment_intent,
      stripeSessionId: sessionId,
      paymentStatus: "paid",
      paidAt: new Date(),
    };

    const result = await paymentCollection.insertOne(paymentInfo);

    const userQuery = { email: customer_email };

    const updatedDoc = {
      $set: {
        subscriptionPlan: "pro",
      },
    };

    const updatedResult = await usersCollection.updateOne(
      userQuery,
      updatedDoc,
    );

    res.json({ success: true, result, updatedResult });
    return;
  }

  res.json({ success: false, message: "Payment verification failed" });
});

app.get("/payments", verifyToken, verifyAdmin, async (req, res) => {
  const cursor = paymentCollection.find();
  const result = await cursor.toArray();
  res.status(200).json(result);
});

app.get(
  "/dashboard/student/stats",
  verifyToken,
  verifyStudent,
  async (req, res) => {
    const email = req.user.email;

    const pipeline = [
      { $match: { email } },

      {
        $lookup: {
          from: "applications",
          localField: "email",
          foreignField: "studentEmail",
          as: "applications",
        },
      },

      {
        $project: {
          _id: 0,
          totalAppliedTuitions: { $size: "$applications" },

          acceptedApplications: {
            $size: {
              $filter: {
                input: "$applications",
                cond: { $eq: ["$$this.status", "accepted"] },
              },
            },
          },

          pendingApplications: {
            $size: {
              $filter: {
                input: "$applications",
                cond: { $eq: ["$$this.status", "pending"] },
              },
            },
          },

          currentPlan: { $ifNull: ["$subscriptionPlan", "free"] },
        },
      },
    ];

    const stats = await usersCollection.aggregate(pipeline).toArray();

    res.status(200).json(stats[0]);
  },
);

app.get(
  "/dashboard/tutor/stats",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    const email = req.user.email;

    const pipeline = [
      { $match: { email } },

      {
        $lookup: {
          from: "tutions",
          localField: "email",
          foreignField: "tutorEmail",
          as: "tuitions",
        },
      },

      {
        $lookup: {
          from: "applications",
          localField: "email",
          foreignField: "tutorEmail",
          as: "applications",
        },
      },

      {
        $project: {
          _id: 0,
          totalTuitionsPosted: { $size: "$tuitions" },

          activeApprovedTuitions: {
            $size: {
              $filter: {
                input: "$tuitions",
                cond: {
                  $and: [
                    { $eq: ["$$this.isActive", true] },
                    { $eq: ["$$this.approvalStatus", "approved"] },
                  ],
                },
              },
            },
          },

          totalApplicantsReceived: { $size: "$applications" },

          currentPlan: { $ifNull: ["$subscriptionPlan", "free"] },
        },
      },
    ];

    const stats = await usersCollection.aggregate(pipeline).toArray();

    res.status(200).json(stats[0]);
  },
);

app.get(
  "/dashboard/admin/stats",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const pipeline = [
      {
        $facet: {
          userStats: [
            {
              $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                totalTutors: {
                  $sum: { $cond: [{ $eq: ["$role", "tutor"] }, 1, 0] },
                },
              },
            },
          ],

          tuitionStats: [
            {
              $lookup: {
                from: "tutions",
                pipeline: [
                  {
                    $group: {
                      _id: null,
                      pendingTuitions: {
                        $sum: {
                          $cond: [
                            { $eq: ["$approvalStatus", "pending"] },
                            1,
                            0,
                          ],
                        },
                      },
                      approvedTuitions: {
                        $sum: {
                          $cond: [
                            { $eq: ["$approvalStatus", "approved"] },
                            1,
                            0,
                          ],
                        },
                      },
                    },
                  },
                ],
                as: "stats",
              },
            },
            { $unwind: "$stats" },
            { $replaceRoot: { newRoot: "$stats" } },
          ],

          paymentStats: [
            {
              $lookup: {
                from: "payments",
                pipeline: [
                  { $match: { paymentStatus: "paid" } },
                  {
                    $group: {
                      _id: null,
                      totalStripeRevenue: { $sum: "$amount" },
                    },
                  },
                ],
                as: "stats",
              },
            },
            { $unwind: "$stats" },
            { $replaceRoot: { newRoot: "$stats" } },
          ],
        },
      },
    ];

    const stats = await usersCollection.aggregate(pipeline).toArray();

    res.status(200).json(stats[0]);
  },
);

export default app;
