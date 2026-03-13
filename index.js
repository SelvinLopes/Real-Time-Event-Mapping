import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import session from "express-session";

import { Server } from "socket.io";
import http from "http";

const app = express();
const port = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server);


io.on("connection", (socket) => {
  console.log("User connected: ",
    socket.id);
});

app.set("view engine", "ejs");

app.use(  //For every user, create a memory box (session).
  session({
    secret: "mysecretkey",
    resave: false,
    saveUninitialized: false,
  })
);

const db = new pg.Client({
  connectionString: 
  process.env.DATABASE_URL,
   ssl: { 
    rejectUnauthorized: false 
  }
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/register", (req, res) => {
  res.render("register"); //user making req to server index.js for register page, this line renders register.ejs to user. Now whatever user enters on the rendered page, will be seen over here.
});

//GET route dashboard - Inside website
app.get("/dashboard", async (req, res) => {

  // 🔒 Protect dashboard
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  try {
    //get logged in
    const userResult = await db.query(
      "SELECT name FROM userstable WHERE id = $1",
      [req.session.userId]
    );

    const user = userResult.rows[0];

    const allEvents = await db.query(
    "SELECT * FROM events ORDER BY created_at DESC"
    );

    const userEvents = await db.query(
    "SELECT * FROM events WHERE created_by = $1 ORDER BY created_at DESC",
    [req.session.userId]
    );

    const successMessage = req.query.success;

    res.render("dashboard", {
    username: user.name,
    success: successMessage,
    events: allEvents.rows,
    userEvents: userEvents.rows
    });

  } catch (err) {
    console.log("ERROR: ", err);
    res.send("Error occurred");
  }
});

app.get("/create-event", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  const { lat, lng } = req.query;

  res.render("create-event", {
    latitude: lat || "",
    longitude: lng || ""
  });
});


app.post("/delete-event/:id", async (req, res) => {

  const eventId = req.params.id;

  try {

    await db.query(
      "DELETE FROM events WHERE id = $1 AND created_by = $2",
      [eventId, req.session.userId]
    );
    io.emit("delete-event", eventId);

    res.redirect("/dashboard");

  } catch (err) {
    console.log("ERROR: ", err);
    res.send("Error occurred");
  }

});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

//Registration
app.post("/register", async (req, res) => {
  const name = req.body.name;
  const email = req.body.email;
  const password = req.body.password;
  const confirmPassword = req.body.confirmPassword;

  if (password !== confirmPassword) {
    return res.render("register", { error: "Passwords do not match" });
  }

  try{
    const checkResult = await db.query("SELECT * FROM userstable WHERE email = $1", 
      [email,]
    );

    if (checkResult.rows.length > 0) { 
      return res.render("register", { error: "Email already exists. Try logging in." });
    } else {
      const result = await db.query(
      "INSERT INTO userstable (name, email, password) VALUES ($1, $2, $3) RETURNING id",
      [name, email, password]
    );

    // 🔐 Save user ID in session after registration
    req.session.userId = result.rows[0].id;

    res.redirect("/dashboard");
    }
  }
  catch (err) {
    console.log("ERROR: ", err);
    res.send("Error occurred");
  }
});

//Login
app.post("/login", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try{
    const result = await db.query("SELECT * FROM userstable WHERE email = $1", 
      [email,]
    );
    
    if (result.rows.length > 0) {
      //console.log(result.rows);
      const user = result.rows[0];
      const storedPassword = user.password; //extracts only the password field from that user object

      if (password === storedPassword) {
        // 🔐 Save user ID in session, user remembers that session
        req.session.userId = user.id;
        res.redirect("/dashboard");
      } else {
        return res.render("login", { error: "Incorrect Password" });
      }
    } else {
      return res.render("login", { error: "User not found. Try Registering." });
    }
  }
  catch (err) {
    console.log("ERROR: ", err);
    res.send("Error occurred");
  }
});

//Post Inside website for POST dashboard /create-event
app.post("/create-event", async (req, res) => {
  const { title, description, latitude, longitude } = req.body;
  
  try{
    const checkResult = await db.query("SELECT * FROM events WHERE title = $1", 
      [title]
    );

    const timeStamp = await db.query("SELECT * FROM events WHERE title = $1", 
      [title]
    );

    if (checkResult.rows.length > 0) { 
      return res.render("create-event", { error: "Title already exists. Try another title.",
        latitude: latitude,
        longitude: longitude
       });
    }
    
      const result = await db.query(
      "INSERT INTO events (title, description, latitude, longitude, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [title, description, latitude, longitude, req.session.userId]
    );

    const newEvent = result.rows[0];
    io.emit("new-event" , newEvent);

    res.redirect("/dashboard?success=Event created successfully");
    
  }
  catch (err) {
    console.log("ERROR: ", err);
    res.send("Error occurred");
  }
});


server.listen(port,()=>{
    console.log(`Server running on ${port}`);
});

    