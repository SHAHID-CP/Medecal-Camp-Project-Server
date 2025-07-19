require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app= express();
const port= process.env.PORT || 3000;
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SK_KEY)

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bzpevoa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
}
});

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});



const verifyFireBaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  }
  catch (error) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
}






async function run() {
try {
    await client.connect();

    const database=client.db('mediCampDb');
    const usersCollection= database.collection('user');
    const campCollection= database.collection('addcamp');
    const participantCollection = database.collection('participants');
    const paymentsCollection = database.collection('payments');
    const feedbackCollection = database.collection('feedback');
    

    const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
    }

    const verifyPerticipant = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'participent') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
    }

    //  payment intent make
    app.get('/user/:email', verifyFireBaseToken,async (req, res) => {
    const { email } = req.params;
    if (email !== req.decoded.email) {
        return res.status(403).message({ message: 'forbidden access' })
    }
    const user = await usersCollection.findOne({ email });
    res.send(user);
    });

    app.patch('/user/:email', verifyFireBaseToken,async (req, res) => {
    const { email } = req.params;
    if (email !== req.decoded.email) {
        return res.status(403).message({ message: 'forbidden access' })
    }
    const { name, image, phone } = req.body;
    const result = await usersCollection.updateOne(
    { email: email },
    { $set: { name, image, phone } }
    );
    res.send(result);
    });





    app.get('/allcamp', async(req,res)=>{
            const cursor =campCollection.find();
            const dbresult= await cursor.toArray();
            res.send(dbresult);
    })

    app.get('/camp/:campId', async (req, res) => {
        const { campId } = req.params;
        try {
            const result = await campCollection.findOne({ _id: new ObjectId(campId) });
            if (!result) {
            return res.status(404).send({ message: 'Camp not found' });
            }
            res.send(result);
        } catch (error) {
            res.status(500).send({ message: 'Server error', error });
          }
    });

    app.post('/addcamp', async(req,res)=>{
      const campData = req.body;

      const result = await campCollection.insertOne(campData)
      res.send(result)

    })


    app.post('/participants', async (req, res) => {
        const participantData = req.body;

              participantData.joinedAt = new Date().toISOString();

              try {
                const result = await participantCollection.insertOne(participantData);
                res.send(result);
              } catch (error) {
                  res.status(500).send({ message: 'Failed to register participant', error });
              }
    });


    app.patch('/camp/:campId/increment-participant', async (req, res) => {
        const { campId } = req.params;
        try {
          const result = await campCollection.updateOne(
          { _id: new ObjectId(campId) },
          { $inc: { participantCount: 1 } }
          );
          if (result.modifiedCount === 0) {
            return res.status(404).send({ message: 'Camp not found or not updated' });
          }
          res.send({ message: 'Participant count incremented' });
        } catch (error) {
          res.status(500).send({ message: 'Failed to update participant count', error });
        }
    });

    
     // save or update a users info in db
    app.post('/user', async (req, res) => {
      const userData = req.body
      userData.role = 'participent'
      userData.created_at = new Date().toISOString()
      userData.last_loggedIn = new Date().toISOString()
      const query = {
        email: userData?.email,
      }
      const alreadyExists = await usersCollection.findOne(query)
      if (!!alreadyExists) {
        const result = await usersCollection.updateOne(query, {
          $set: { last_loggedIn: new Date().toISOString() },
        })
        return res.send(result)
      }
      const result = await usersCollection.insertOne(userData)
      res.send(result)
    })

    // get a user's role
    app.get('/user/role/:email', async (req, res) => {
      const email = req.params.email
      const result = await usersCollection.findOne({ email })
      if (!result) return res.status(404).send({ message: 'User Not Found.' })
      res.send({ role: result?.role })
    })


    app.get('/mycamps', verifyFireBaseToken, async (req, res) => {
      const userEmail = req.query.email;
      try {
        const result = await campCollection.find({ email: userEmail }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch camps', error });
      }
    });

    app.patch('/update-camp/:campId', verifyFireBaseToken, async (req, res) => {
      const { campId } = req.params;
      const updateData = req.body;
      delete updateData._id;
      try {
        const result = await campCollection.updateOne(
          { _id: new ObjectId(campId) },
          { $set: updateData }
        );
        if (result.modifiedCount === 0) {
        return res.status(404).send({ message: 'Camp not found or unchanged' });
        }
        res.send({ message: 'Camp updated successfully' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to update camp', error });
      }
    });

    app.delete('/delete-camp/:campId', verifyFireBaseToken, async (req, res) => {
      const { campId } = req.params;
      try {
        const result = await campCollection.deleteOne({ _id: new ObjectId(campId) });
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Camp not found or already deleted' });
        }
        res.send({ message: 'Camp deleted successfully' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to delete camp', error });
      }
    });


    app.get('/all-participants', verifyFireBaseToken, async (req, res) => {
  const email = req.decoded?.email;

  //  Check if the user is admin
  const adminUser = await usersCollection.findOne({ email });
  if (!adminUser || adminUser.role !== 'admin') {
    return res.status(403).send({ message: 'Forbidden: Admins only' });
  }

  try {
    const participants = await participantCollection
      .find({})
      .sort({ joinedAt: -1 })
      .toArray();

    res.send(participants);
  } catch (error) {
    
    res.status(500).send({ message: 'Failed to fetch participants', error });
  }
 });

 app.delete('/cancel-camp/:id', verifyFireBaseToken, async (req, res) => {
  const participantId = req.params.id;

  try {
    //  Check participant exists
    const participant = await participantCollection.findOne({ _id: new ObjectId(participantId) });

    if (!participant) {
      return res.status(404).send({ message: 'Participant not found' });
    }

    //  If already paid & confirmed, don’t allow cancellation
    if (participant.paymentStatus === 'paid' && participant.confirmationStatus === 'confirmed') {
      return res.status(400).send({
        message: 'Cannot cancel — Participant has already paid and confirmed.'
      });
    }

    //  Delete participant record
    const result = await participantCollection.deleteOne({ _id: new ObjectId(participantId) });

    if (result.deletedCount === 1) {
      res.send({ message: 'Participant registration canceled successfully' });
    } else {
      res.status(500).send({ message: 'Failed to cancel registration' });
    }

  } catch (error) {
    
    res.status(500).send({ message: 'Error cancelling camp', error });
  }
});










    // participent db strat

    app.get('/registered-camps', verifyFireBaseToken, async (req, res) => {
    const email = req.decoded.email;
        try {
          const result = await participantCollection
          .find({ participantEmail: email })
          .toArray();
          res.send(result);
        } catch (error) {
        res.status(500).send({ message: 'Failed to fetch registered camps', error });
        }
    });

    app.get('/feedbacks', async (req, res) => {
    try {
      const feedbackCollection = database.collection('feedbacks');
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: 'Failed to load feedbacks', error });
      }
    });


    app.post('/feedback', verifyFireBaseToken, async (req, res) => {
      const { participantId, comment, rating,participantName } = req.body;

      try {
      const result = await feedbackCollection.insertOne({
      participantId: new ObjectId(participantId),
      comment,
      rating,
      participantName,
      email: req.decoded.email,
      submittedAt: new Date().toISOString()
      });

      res.send({ message: 'Feedback submitted',result });
      } catch (error) {
        res.status(500).send({ message: 'Feedback submission failed', error });
      }
    });

    app.get('/chkfeedback', verifyFireBaseToken, async (req, res) => {
        const participantId = req.query.participantId;

        try {
          const feedback = await feedbackCollection.findOne({participantId : new ObjectId(participantId) });
          if (feedback) {
          res.send(feedback);
          } else {
          res.send(null); 
          }
        } catch (error) {
          res.status(500).send({ error: 'Failed to fetch feedback' });
        }
    });

    app.delete('/cancel-registration/:id', verifyFireBaseToken, async (req, res) => {
      const { id } = req.params;
      try {
          const result = await participantCollection.deleteOne({
          _id: new ObjectId(id),
          paymentStatus: { $ne: 'paid' }
          });
          if (result.deletedCount === 0) {
            return res.status(400).send({ message: 'Already paid or not found' });
          }
          res.send({ message: 'Registration cancelled' });
      } catch (error) {
        res.status(500).send({ message: 'Cancellation failed', error });
      }
    });




  
  app.post('/payment-intent', verifyFireBaseToken, async (req, res) => {
  try {
    const { campId, participantId } = req.body;

    if (!campId || !participantId) {
      return res.status(400).send({ error: 'campId and participantId are required' });
    }

    // Step 1: Get participant
    const participant = await participantCollection.findOne({ _id: new ObjectId(participantId) });
    if (!participant) {
      return res.status(404).send({ error: 'Participant not found' });
    }

    // Step 2: Get camp to verify fees
    const camp = await campCollection.findOne({ _id: new ObjectId(campId) });
    if (!camp) {
      return res.status(404).send({ error: 'Camp not found' });
    }

    const verifiedAmount = camp.fees;
    if (!verifiedAmount) {
      return res.status(400).send({ error: 'Camp fee is invalid' });
    }

    // Step 3: Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: parseInt(verifiedAmount * 100), // cents
      currency: 'usd',
      metadata: {
        campId,
        participantId
      }
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).send({ error: 'Payment intent creation failed', message: error.message });
  }
  });


  app.post('/confirm-payment', verifyFireBaseToken, async (req, res) => {
  const { paymentIntentId, campId, participantId } = req.body;

  if (!paymentIntentId || !campId || !participantId) {
    return res.status(400).send({ message: 'Missing required payment info' });
  }

  try {
    // 1. Update participant status
    const confirmResult = await participantCollection.updateOne(
      { _id: new ObjectId(participantId) },
      {
        $set: {
          paymentStatus: 'paid',
          confirmationStatus: 'confirmed',
          paymentIntentId,
          paidAt: new Date().toISOString()
        }
      }
    );

    if (confirmResult.modifiedCount === 0) {
      return res.status(404).send({ message: 'Participant not found or already confirmed' });
    }

    // 2. Get participant info for payment history
    const participant = await participantCollection.findOne({ _id: new ObjectId(participantId) });
    if (!participant) {
      return res.status(404).send({ message: 'Participant not found for payment history' });
    }

    // 3. Insert into paymentsCollection
    const paymentRecord = {
      participantId: participant._id,
      participantName: participant.participantName,
      email: req.decoded.email,
      campId: participant.campId,
      campName: participant.campName,
      campFees: participant.campFees,
      paymentIntentId,
      status: 'paid',
      confirmed: true,
      paidAt: new Date().toISOString()
    };

    await paymentsCollection.insertOne(paymentRecord);

    res.send({ message: 'Payment confirmed' });

  } catch (error) {
    
    res.status(500).send({ message: 'Failed to confirm payment', error });
  }
});

app.get('/payment-history', verifyFireBaseToken, async (req, res) => {
  const userEmail = req.decoded.email;

  try {
    const payments = await paymentsCollection
      .find({ email: userEmail })
      .sort({ paidAt: -1 }) // latest payment first
      .toArray();

    res.send(payments);
  } catch (error) {
    
    res.status(500).send({ message: 'Failed to fetch payment history', error });
  }
});








    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } finally {

    }
}
run().catch(console.dir);



app.get('/', (req,res)=>{
    res.send(" server theke ui te data jasse")
})

app.listen(port, ()=>{
    console.log(`server is run kore ${port}`);
})