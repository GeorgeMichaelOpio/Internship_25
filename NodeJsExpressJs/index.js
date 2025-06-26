// Import required modules
const express = require('express'); // Framework for building the API
const mysql = require('mysql'); // MySQL database driver
const cors = require('cors'); // Middleware to enable Cross-Origin Resource Sharing

// Initialize Express application
const app = express();

// ======================
// MIDDLEWARE SETUP
// ======================

// Enable CORS (Cross-Origin Resource Sharing) to allow requests from different domains
// In production, you should restrict the origin to specific domains instead of '*'
app.use(cors({
  origin: '*', // Allow all origins (for development)
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type'] // Allowed request headers
}));

// Enable JSON request body parsing
app.use(express.json());

// ======================
// DATABASE CONFIGURATION
// ======================

// Database connection settings
const dbConfig = {
  host: 'localhost', // Database server address
  user: 'root', // Database username
  password: '', // Database password (empty for development)
  database: 'mydb' // Database name
};

// Create a connection pool to manage database connections efficiently
// Connection pools reuse connections rather than creating new ones for each request
const pool = mysql.createPool({
  ...dbConfig, // Spread the dbConfig object
  connectionLimit: 10, // Maximum number of connections in the pool
  waitForConnections: true, // Wait for a connection if none are available
  queueLimit: 0 // Unlimited queue size for connection requests
});

// Test the database connection when the server starts
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    return;
  }
  console.log('Successfully connected to MySQL database');
  connection.release(); // Release the connection back to the pool
});

// ======================
// HELPER FUNCTIONS
// ======================

/**
 * Helper function to execute database queries safely
 * @param {string} sql - The SQL query to execute
 * @param {array} params - Parameters to prevent SQL injection
 * @param {function} callback - Callback function to handle results
 */
function queryDatabase(sql, params, callback) {
  // Get a connection from the pool
  pool.getConnection((err, connection) => {
    if (err) return callback(err);
    
    // Execute the query with provided parameters
    connection.query(sql, params, (queryErr, results) => {
      // Always release the connection back to the pool when done
      connection.release();
      
      if (queryErr) return callback(queryErr);
      callback(null, results);
    });
  });
}

// ======================
// API ROUTES
// ======================

/**
 * Home Route - Basic API information
 * GET /
 */
app.get('/', (req, res) => {
  res.send("Welcome to the User Management API");
});

/**
 * Get All Users
 * GET /users
 * Returns a list of all users in the database
 */
app.get('/users', (req, res) => {
  queryDatabase('SELECT * FROM users', [], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
    res.json(results);
  });
});

/**
 * Get Single User by ID
 * GET /users/:id
 * Returns details of a specific user
 */
app.get('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  
  // Validate the user ID is a number
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  queryDatabase('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch user' });
    }
    
    // Check if user was found
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return the first (and should be only) matching user
    res.json(results[0]);
  });
});

/**
 * Create New User
 * POST /users
 * Creates a new user with a randomly generated ID
 * Required fields: name, email, contact
 */
app.post('/users', (req, res) => {
  const { name, email, contact } = req.body;
  
  // Validate required fields are present
  if (!name || !email || !contact) {
    return res.status(400).json({ 
      error: 'Name, email, and contact are required' 
    });
  }

  // Generate a random 6-digit user ID
  const userId = Math.floor(100000 + Math.random() * 900000);
  
  queryDatabase(
    'INSERT INTO users (id, name, email, contact) VALUES (?, ?, ?, ?)',
    [userId, name, email, contact],
    (err, result) => {
      if (err) {
        console.error('Database error:', err);
        
        // Handle the very rare case of duplicate ID
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ 
            error: 'ID collision occurred. Please try again.' 
          });
        }
        
        return res.status(500).json({ error: 'Failed to create user' });
      }
      
      // HTTP 201 status indicates successful creation
      res.status(201).json({
        message: 'User created successfully',
        userId: userId // Return the generated ID
      });
    }
  );
});

/**
 * Update Existing User
 * PUT /users/:id
 * Updates one or more fields of an existing user
 * At least one field (name, email, or contact) must be provided
 */
app.put('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const { name, email, contact } = req.body;
  
  // Validate user ID
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  
  // Validate at least one field is provided
  if (!name && !email && !contact) {
    return res.status(400).json({ 
      error: 'At least one field (name, email, contact) must be provided' 
    });
  }

  // Dynamically build the update query based on provided fields
  let updateFields = [];
  let updateValues = [];
  
  if (name) {
    updateFields.push('name = ?');
    updateValues.push(name);
  }
  if (email) {
    updateFields.push('email = ?');
    updateValues.push(email);
  }
  if (contact) {
    updateFields.push('contact = ?');
    updateValues.push(contact);
  }
  
  // Add userId for the WHERE clause
  updateValues.push(userId);
  
  // Construct the full SQL query
  const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
  
  queryDatabase(query, updateValues, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to update user' });
    }
    
    // Check if any rows were affected (user exists)
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User updated successfully' });
  });
});

/**
 * Delete User
 * DELETE /users/:id
 * Deletes a user by ID
 */
app.delete('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  
  // Validate user ID
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  queryDatabase('DELETE FROM users WHERE id = ?', [userId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to delete user' });
    }
    
    // Check if any rows were affected (user exists)
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  });
});

// ======================
// START THE SERVER
// ======================

const PORT = process.env.PORT || 4567; // Use environment variable or default port

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log(`- GET    http://localhost:${PORT}/users - Get all users`);
  console.log(`- GET    http://localhost:${PORT}/users/:id - Get single user`);
  console.log(`- POST   http://localhost:${PORT}/users - Create new user`);
  console.log(`- PUT    http://localhost:${PORT}/users/:id - Update user`);
  console.log(`- DELETE http://localhost:${PORT}/users/:id - Delete user`);
});