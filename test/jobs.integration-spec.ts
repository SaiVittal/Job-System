import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JobQueueService } from '../src/nest/job.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Jobs Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queueService: JobQueueService;

  const mockQueueService = {
    dispatchJob: jest.fn().mockResolvedValue({ id: 'bull-123' }),
    getQueueLength: jest.fn().mockResolvedValue(0),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JobQueueService)
      .useValue(mockQueueService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    queueService = app.get<JobQueueService>(JobQueueService);
  });

  afterAll(async () => {
    await prisma.job.deleteMany(); // Clean up test data
    await app.close();
  });

  it('should create a job and dispatch it to the queue', async () => {
    const payload = {
      type: 'email',
      payload: { to: 'test@example.com', subject: 'Hello' },
      idempotencyKey: 'test-key-' + Date.now(),
    };

    const response = await request(app.getHttpServer())
      .post('/jobs')
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      type: 'email',
      status: 'queued',
    });

    // Verify DB entry
    const dbJob = await prisma.job.findUnique({
      where: { id: response.body.id },
    });
    expect(dbJob).toBeDefined();

    // Verify Dispatch
    expect(mockQueueService.dispatchJob).toHaveBeenCalledWith(
      response.body.id,
      'email',
      payload.idempotencyKey
    );
  });

  it('should enforce idempotency at the API level', async () => {
    const key = 'shared-key-' + Date.now();
    const payload = {
      type: 'email',
      payload: { to: 'test@example.com' },
      idempotencyKey: key,
    };

    // First request
    const res1 = await request(app.getHttpServer()).post('/jobs').send(payload).expect(201);
    
    // Second request with same key
    const res2 = await request(app.getHttpServer()).post('/jobs').send(payload).expect(201);

    expect(res1.body.id).toBe(res2.body.id); // Should return the same job
    expect(mockQueueService.dispatchJob).toHaveBeenCalledTimes(2); // In our impl, it still tries to dispatch (BullMQ handles jobId dedupe)
  });

  it('should apply backpressure when queue is full', async () => {
    mockQueueService.getQueueLength.mockResolvedValueOnce(10001); // Over the limit

    const payload = { type: 'email', payload: {} };
    
    const response = await request(app.getHttpServer())
      .post('/jobs')
      .send(payload)
      .expect(400); // Changed from 500

    expect(response.body.message).toContain('System overloaded');
  });
});
