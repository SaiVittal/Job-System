import { HandlerRegistry } from './handler.registry';
import { JobHandler } from '../interfaces/job-handler.interface';

describe('HandlerRegistry', () => {
  let registry: HandlerRegistry;
  let mockHandler: JobHandler;

  beforeEach(() => {
    registry = new HandlerRegistry();
    mockHandler = {
      handle: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('should register and retrieve a handler', () => {
    registry.register('email', mockHandler);
    expect(registry.getHandler('email')).toBe(mockHandler);
  });

  it('should throw error when registering duplicate handler type', () => {
    registry.register('email', mockHandler);
    expect(() => registry.register('email', mockHandler)).toThrow(
      'Handler for job type "email" is already registered.'
    );
  });

  it('should return undefined for unregistered handler type', () => {
    expect(registry.getHandler('unknown')).toBeUndefined();
  });

  it('should return all registered types', () => {
    registry.register('email', mockHandler);
    registry.register('sms', mockHandler);
    expect(registry.getAllRegisteredTypes()).toEqual(['email', 'sms']);
  });
});
