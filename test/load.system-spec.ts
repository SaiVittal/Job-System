import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JobQueueService } from '../src/nest/job.service';
import { PrismaService } from '../prisma/prisma.service';

describe('System Load Test', () => {
  let app: INestApplication;

  const mockQueueService = {
    dispatchJob: jest.fn().mockResolvedValue({ id: 'bull-123' }),
    getQueueLength: jest.fn().mockResolvedValue(0),
  };

  const mockPrismaService = {
    job: {
      create: jest.fn().mockImplementation((data) => Promise.resolve({ id: Math.floor(Math.random() * 1000), ...data.data })),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JobQueueService)
      .useValue(mockQueueService)
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should handle 20 concurrent job creation requests', async () => {
    const requests = Array.from({ length: 20 }).map((_, i) => {
      return request(app.getHttpServer())
        .post('/jobs')
        .send({
          type: 'notification',
          payload: { message: `Load test ${i}` },
          idempotencyKey: `load-test-${Date.now()}-${i}`,
        });
    });

    const responses = await Promise.all(requests);
    
    responses.forEach(res => {
      expect(res.status).toBe(201);
    });

    expect(mockQueueService.dispatchJob).toHaveBeenCalledTimes(20);
  }, 10000); // 10s timeout
});
