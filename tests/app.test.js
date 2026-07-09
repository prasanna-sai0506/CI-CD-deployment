const request = require('supertest');
const app = require('../index');

describe('Web Application Endpoints', () => {
  // Test 1: Home page loads with 200 OK and serves html
  test('GET / should serve the home page (index.html)', async () => {
    const response = await request(app)
      .get('/')
      .expect('Content-Type', /html/)
      .expect(200);
      
    expect(response.text).toContain('CI/CD Demo Application');
  });

  // Test 2: Health check endpoint returns status ok and a timestamp
  test('GET /health should return 200 OK and status ok', async () => {
    const response = await request(app)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(typeof response.body.timestamp).toBe('string');
  });

  // Test 3: Version endpoint responds with version/commit SHA
  test('GET /api/version should return 200 OK and version info', async () => {
    const response = await request(app)
      .get('/api/version')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('version');
    expect(typeof response.body.version).toBe('string');
  });

  // Test 4: Unknown route returns 404 with error message
  test('GET /unknown-route should return 404 Not Found', async () => {
    const response = await request(app)
      .get('/unknown-route')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toHaveProperty('error', 'Route not found');
  });
});
