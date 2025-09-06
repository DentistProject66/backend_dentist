
// const express = require('express');
// const cors = require('cors');
// const helmet = require('helmet');
// const rateLimit = require('express-rate-limit');
// require('dotenv').config();

// const { testConnection } = require('./config/db');
// const routes = require('./routes');

// const app = express();
// const PORT = process.env.PORT || 5000;

// app.use(helmet());

// const limiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
//   max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
//   message: { success: false, message: 'Too many requests from this IP, please try again later.' },
//   standardHeaders: true,
//   legacyHeaders: false,
// });
// app.use(limiter);

// const corsOptions = {
//   origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
//   credentials: true,
//   optionsSuccessStatus: 200,
// };
// app.use(cors(corsOptions));

// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// app.use((req, res, next) => {
//   console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
//   next();
// });

// app.use('/api', routes);

// app.get('/', (req, res) => {
//   res.json({
//     success: true,
//     message: 'Dental Practice Management System API',
//     version: '1.0.0',
//     documentation: '/api/health',
//     status: 'running',
//   });
// });

// app.use('*', (req, res) => {
//   res.status(404).json({ success: false, message: 'Route not found' });
// });

// app.use((err, req, res, next) => {
//   console.error('Error:', err);
//   if (err.code === 'ER_DUP_ENTRY') {
//     return res.status(400).json({ success: false, message: 'Duplicate entry. Resource already exists.' });
//   }
//   if (err.code === 'ER_NO_REFERENCED_ROW_2') {
//     return res.status(400).json({ success: false, message: 'Referenced resource does not exist.' });
//   }
//   if (err.name === 'JsonWebTokenError') {
//     return res.status(401).json({ success: false, message: 'Invalid token' });
//   }
//   if (err.name === 'TokenExpiredError') {
//     return res.status(401).json({ success: false, message: 'Token expired' });
//   }
//   res.status(err.status || 500).json({
//     success: false,
//     message: err.message || 'Internal server error',
//     ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
//   });
// });

// let server;

// process.on('SIGTERM', () => {
//   console.log('SIGTERM received. Shutting down...');
//   server.close(() => console.log('Process terminated'));
// });

// process.on('SIGINT', () => {
//   console.log('SIGINT received. Shutting down...');
//   server.close(() => console.log('Process terminated'));
// });

// const startServer = async () => {
//   try {
//     const dbConnected = await testConnection();
//     if (!dbConnected) {
//       console.error('Failed to connect to database. Exiting...');
//       process.exit(1);
//     }

//     server = app.listen(PORT, () => {
//       console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
//     });
//   } catch (error) {
//     console.error('Failed to start server:', error);
//     process.exit(1);
//   }
// };

// startServer();

// module.exports = app;


const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./config/db');
const routes = require('./routes');

// Add this line to import your database connection
const db = require('./config/db'); // Make sure this points to your actual db connection file

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
app.use(helmet());

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const corsOptions = {
 origin: [
    'http://localhost:3000',        // for local development
    'https://frontenddentist-two.vercel.app/'  // your hosted frontend
  ],  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// ADD THIS ROUTE BEFORE YOUR OTHER ROUTES
app.get('/setup-database', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        console.log('Starting database setup...');
        
        // Read your SQL schema file
        const schemaPath = path.join(__dirname, 'updated_dental_schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            return res.status(404).json({ 
                error: 'Schema file not found', 
                details: `Looking for file at: ${schemaPath}` 
            });
        }
        
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Remove database creation and use statements since Railway handles this
        const cleanedSchema = schema
            .replace(/CREATE DATABASE IF NOT EXISTS.*;/gi, '')
            .replace(/USE.*;/gi, '')
            .replace(/DELIMITER.*;/gi, '') // Remove DELIMITER statements that might cause issues
            .replace(/\/\*.*?\*\//gs, '') // Remove /* */ comments
            .replace(/--.*$/gm, ''); // Remove -- comments
        
        // Split statements and execute
        const statements = cleanedSchema
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && stmt !== 'DELIMITER');
        
        console.log(`Found ${statements.length} SQL statements to execute`);
        
        let executedCount = 0;
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await db.query(statement);
                    executedCount++;
                    console.log(`✓ Executed statement ${executedCount}: ${statement.substring(0, 50).replace(/\n/g, ' ')}...`);
                } catch (statementError) {
                    console.error(`✗ Failed to execute statement: ${statement.substring(0, 100)}...`);
                    console.error('Error:', statementError.message);
                    // Continue with next statement instead of stopping
                }
            }
        }
        
        res.json({ 
            message: 'Database schema import completed!',
            totalStatements: statements.length,
            executedSuccessfully: executedCount,
            status: 'success'
        });
        
    } catch (error) {
        console.error('Schema import failed:', error);
        res.status(500).json({ 
            error: 'Schema import failed', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Dental Practice Management System API',
    version: '1.0.0',
    documentation: '/api/health',
    status: 'running',
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({ success: false, message: 'Duplicate entry. Resource already exists.' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ success: false, message: 'Referenced resource does not exist.' });
  }
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

let server;

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down...');
  server.close(() => console.log('Process terminated'));
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  server.close(() => console.log('Process terminated'));
});

const startServer = async () => {
  try {
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }
    server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

    // server = app.listen(PORT, () => {
    //   console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    // });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;