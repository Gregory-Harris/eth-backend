# EthCare Backend - NestJS API

Complete backend API for EthCare healthcare records management system, integrated with EthCareOptimized smart contract.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (React/Vue)                │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│              NestJS Backend API (This)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Records  │ │   Auth   │ │  Audit   │            │
│  │ Service  │ │ Service  │ │ Service  │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│       ↓             ↓            ↓                   │
│  ┌──────────────────────────────────────┐           │
│  │      Blockchain Service               │           │
│  │  (ethers.js + EthCareOptimized)      │           │
│  └──────────────────────────────────────┘           │
└─────────────────────────────────────────────────────┘
       ↓                    ↓                ↓
┌─────────────┐  ┌────────────────┐  ┌──────────┐
│ PostgreSQL  │  │ Ethereum L1/L2 │  │   IPFS   │
│  (Metadata) │  │   (Contract)   │  │ (Files)  │
└─────────────┘  └────────────────┘  └──────────┘
```

## 📦 **What's Included**

### **Core Modules:**
- ✅ **Blockchain Module** - Direct integration with EthCareOptimized contract
- ✅ **Records Module** - Medical records management (upload, retrieve, delete)
- ✅ **Permissions Module** - Sharing and access control
- ✅ **Encryption Module** - File encryption/decryption (AES-256-GCM)
- ✅ **IPFS Module** - Decentralized file storage
- ✅ **Auth Module** - JWT authentication
- ✅ **Audit Module** - HIPAA-compliant audit logging
- ✅ **Emergency Module** - Emergency access management
- ✅ **Notifications Module** - User notifications
- ✅ **Patients Module** - Patient management
- ✅ **Providers Module** - Healthcare provider management

### **Features:**
- 🔒 **Security**: Helmet, CORS, Rate limiting, Input validation
- 📊 **Logging**: Winston for production-grade logging
- 📚 **Documentation**: Auto-generated Swagger/OpenAPI docs
- 🔄 **Background Jobs**: Bull queue with Redis
- ⏰ **Scheduled Tasks**: Cron jobs for cleanup/monitoring
- 🧪 **Testing**: Jest for unit and e2e tests
- 🎯 **Type Safety**: Full TypeScript with strict mode

## 🚀 **Quick Start**

### **Prerequisites:**

```bash
Node.js >= 18.x
PostgreSQL >= 14.x
Redis >= 6.x
IPFS node (optional, can use Infura)
```

### **1. Installation**

```bash
# Clone backend
cd ethcare-backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### **2. Configure Environment**

Edit `.env` with your values:

```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=ethcare
DATABASE_PASSWORD=your_password
DATABASE_NAME=ethcare_db

# Blockchain (IMPORTANT: Deploy EthCareOptimized first!)
ETHEREUM_NETWORK=sepolia
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
CONTRACT_ADDRESS=0x_your_deployed_contract_address

# IPFS
IPFS_HOST=localhost  # or ipfs.infura.io
IPFS_PORT=5001

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key
```

### **3. Setup Database**

```bash
# Create PostgreSQL database
createdb ethcare_db

# Run migrations (if using TypeORM migrations)
npm run migration:run
```

### **4. Setup Contract ABI**

**CRITICAL:** Copy your contract ABI:

```bash
# From hardhat project after compilation
cp ../hardhat-project/artifacts/contracts/EthCareOptimized.sol/EthCareOptimized.json \
   src/modules/blockchain/abi/EthCareOptimized.json
```

### **5. Start Development Server**

```bash
npm run start:dev
```

Server starts at: `http://localhost:3000`
API Docs at: `http://localhost:3000/api/docs`

## 📚 **API Documentation**

Once running, visit **Swagger UI**:
```
http://localhost:3000/api/docs
```

### **Key Endpoints:**

#### **Authentication**
```
POST   /api/v1/auth/register       - Register new user
POST   /api/v1/auth/login          - Login
POST   /api/v1/auth/refresh        - Refresh token
```

#### **Records**
```
POST   /api/v1/records             - Upload medical record
GET    /api/v1/records/:patientId  - Get patient's records (paginated)
GET    /api/v1/records/:patientId/:ipfsHash  - Download specific record
DELETE /api/v1/records/:patientId/:ipfsHash  - Delete record
```

#### **Permissions**
```
POST   /api/v1/permissions         - Grant/update permission
GET    /api/v1/permissions/check   - Check if access allowed
GET    /api/v1/permissions/current - Get current permission
GET    /api/v1/permissions/history - Get permission history
```

#### **Emergency Access**
```
POST   /api/v1/emergency/grant     - Grant emergency access
GET    /api/v1/emergency/check     - Check emergency access status
```

#### **Patients**
```
POST   /api/v1/patients            - Create patient account
GET    /api/v1/patients/:id        - Get patient details
PATCH  /api/v1/patients/:id        - Update patient
```

## 🔐 **Security Features**

### **1. Authentication Flow**

```typescript
// User registers/logs in
POST /auth/login
→ Returns JWT token

// Include token in requests
Authorization: Bearer <token>

// Backend validates token
→ Extracts user ID
→ Checks permissions
→ Logs access
```

### **2. Access Control**

```typescript
// Every record access is checked
1. Check JWT token (authentication)
2. Check blockchain permission (authorization)
3. Log access attempt (audit)
4. Return data or deny
```

### **3. Encryption**

```typescript
// Files are encrypted before IPFS upload
1. Generate encryption key for patient
2. Encrypt file with AES-256-GCM
3. Upload encrypted file to IPFS
4. Store IPFS hash on blockchain (NO password)
5. When accessing: Download → Decrypt → Return
```

### **4. Audit Logging**

Every action is logged:
- ✅ Who (user ID)
- ✅ What (action type)
- ✅ When (timestamp)
- ✅ Where (IP address)
- ✅ Why (justification if applicable)
- ✅ Result (success/failure)

## 🏗️ **Project Structure**

```
src/
├── modules/
│   ├── auth/                    # JWT authentication
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── guards/
│   ├── blockchain/              # Smart contract integration
│   │   ├── blockchain.service.ts
│   │   ├── blockchain.module.ts
│   │   └── abi/
│   │       └── EthCareOptimized.json  # Contract ABI
│   ├── records/                 # Medical records
│   │   ├── records.controller.ts
│   │   ├── records.service.ts
│   │   ├── entities/
│   │   │   └── record.entity.ts
│   │   └── dto/
│   ├── permissions/             # Access control
│   │   ├── permissions.controller.ts
│   │   └── permissions.service.ts
│   ├── encryption/              # File encryption
│   │   └── encryption.service.ts
│   ├── ipfs/                    # IPFS integration
│   │   └── ipfs.service.ts
│   ├── audit/                   # Audit logging
│   │   ├── audit.service.ts
│   │   └── entities/
│   │       └── audit-log.entity.ts
│   ├── emergency/               # Emergency access
│   │   ├── emergency.controller.ts
│   │   └── emergency.service.ts
│   ├── patients/                # Patient management
│   │   └── patients.service.ts
│   ├── providers/               # Provider management
│   │   └── providers.service.ts
│   └── notifications/           # Notifications
│       └── notification.service.ts
├── common/                      # Shared code
│   ├── decorators/
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   └── pipes/
├── config/                      # Configuration
├── main.ts                      # Entry point
└── app.module.ts                # Root module
```

## 🧪 **Testing**

```bash
# Unit tests
npm run test

# e2e tests
npm run test:e2e

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## 🚀 **Deployment**

### **Production Build**

```bash
# Build
npm run build

# Start production server
npm run start:prod
```

### **Environment Variables (Production)**

```bash
NODE_ENV=production
PORT=3000

# Use production database
DATABASE_HOST=your-prod-db.com
DATABASE_SSL=true

# Use mainnet or L2
ETHEREUM_NETWORK=mainnet  # or polygon, arbitrum
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY

# Secure secrets
JWT_SECRET=<generate-strong-secret>
ENCRYPTION_KEY=<generate-32-byte-key>

# Production IPFS
IPFS_HOST=ipfs.infura.io
IPFS_PORT=5001
IPFS_PROTOCOL=https
```

### **Docker Deployment**

```bash
# Build image
docker build -t ethcare-backend .

# Run container
docker run -p 3000:3000 --env-file .env ethcare-backend
```

### **Kubernetes Deployment**

```bash
# Apply k8s configs
kubectl apply -f k8s/
```

## 📊 **Monitoring**

### **Health Check**

```
GET /health
```

### **Metrics**

```
GET /metrics
```

### **Logs**

Logs are written to:
- `logs/error.log` - Errors only
- `logs/combined.log` - All logs

## 🔧 **Development Tips**

### **Hot Reload**

```bash
npm run start:dev
```

Changes are automatically reloaded.

### **Debugging**

```bash
npm run start:debug
```

Attach debugger on port 9229.

### **Linting**

```bash
npm run lint
```

### **Formatting**

```bash
npm run format
```

## 🌐 **Integration with Frontend**

### **Example: Upload Record**

```typescript
// Frontend (React/Vue)
const formData = new FormData();
formData.append('file', file);
formData.append('recordType', 'lab_result');
formData.append('description', 'Blood test results');

const response = await fetch('http://localhost:3000/api/v1/records', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData
});

const result = await response.json();
console.log('Uploaded:', result.ipfsHash);
```

### **Example: Check Access**

```typescript
const canAccess = await fetch(
  `http://localhost:3000/api/v1/permissions/check?owner=${patientId}&viewer=${doctorId}&ipfsHash=${hash}`,
  {
    headers: { 'Authorization': `Bearer ${token}` }
  }
).then(r => r.json());

if (canAccess.allowed) {
  // Download and decrypt record
}
```

## 🐛 **Troubleshooting**

### **Contract ABI Error**

```
Error: Cannot find module './abi/EthCareOptimized.json'
```

**Solution:** Copy ABI from compiled contract:
```bash
cp ../hardhat-project/artifacts/contracts/EthCareOptimized.sol/EthCareOptimized.json \
   src/modules/blockchain/abi/
```

### **Database Connection Error**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:** Ensure PostgreSQL is running:
```bash
# Check status
pg_isready

# Start PostgreSQL
sudo systemctl start postgresql
```

### **IPFS Connection Error**

```
Error: connect ECONNREFUSED 127.0.0.1:5001
```

**Solution:** Start IPFS daemon:
```bash
ipfs daemon
```

Or use Infura IPFS:
```bash
IPFS_HOST=ipfs.infura.io
IPFS_PORT=5001
IPFS_PROTOCOL=https
```

## 📞 **Support**

For issues or questions:
1. Check API documentation at `/api/docs`
2. Review logs in `logs/` directory
3. Check contract events on blockchain explorer
4. Review audit logs in database

## 🔗 **Related Projects**

- **Smart Contracts**: `../hardhat-project/contracts/EthCareOptimized.sol`
- **Frontend**: (Your React/Vue app)
- **Mobile**: (Your React Native/Flutter app)

## 📄 **License**

MIT

## 🤝 **Contributing**

1. Follow TypeScript best practices
2. Write tests for new features
3. Update API documentation
4. Ensure all tests pass
5. Follow commit message conventions

---

## ⚡ **Quick Commands Reference**

```bash
# Development
npm run start:dev          # Start with hot reload
npm run start:debug        # Start with debugger

# Building
npm run build              # Production build

# Testing
npm test                   # Run tests
npm run test:e2e           # E2E tests
npm run test:cov           # Coverage

# Database
npm run migration:generate # Generate migration
npm run migration:run      # Run migrations

# Code Quality
npm run lint               # Lint code
npm run format             # Format code
```

---

**Ready to build the future of healthcare! 🏥💙**
