require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app= express();
const port= process.env.PORT || 3000;
const admin = require("firebase-admin");

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
    

    const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
    }






    
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