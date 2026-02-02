import { describe, it, expect } from 'vitest';
import {
  createJsonRpcRequest,
  createJsonRpcResponse,
  createJsonRpcError,
  createJsonRpcNotification,
  ErrorCodes,
} from '../types/messages.js';

describe('Messages', () => {
  describe('createJsonRpcRequest', () => {
    it('should create a valid JSON-RPC request', () => {
      const request = createJsonRpcRequest(1, 'test.method', { foo: 'bar' });

      expect(request).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'test.method',
        params: { foo: 'bar' },
      });
    });

    it('should create a request without params', () => {
      const request = createJsonRpcRequest('abc', 'test.method');

      expect(request).toEqual({
        jsonrpc: '2.0',
        id: 'abc',
        method: 'test.method',
      });
    });
  });

  describe('createJsonRpcResponse', () => {
    it('should create a valid JSON-RPC response', () => {
      const response = createJsonRpcResponse(1, { result: 'success' });

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: { result: 'success' },
      });
    });
  });

  describe('createJsonRpcError', () => {
    it('should create a valid JSON-RPC error response', () => {
      const error = createJsonRpcError(
        1,
        ErrorCodes.InvalidParams,
        'Invalid parameters',
        { field: 'name' }
      );

      expect(error).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32602,
          message: 'Invalid parameters',
          data: { field: 'name' },
        },
      });
    });

    it('should create an error response without data', () => {
      const error = createJsonRpcError(1, ErrorCodes.InternalError, 'Internal error');

      expect(error).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32603,
          message: 'Internal error',
        },
      });
    });
  });

  describe('createJsonRpcNotification', () => {
    it('should create a valid JSON-RPC notification', () => {
      const notification = createJsonRpcNotification('event.occurred', {
        eventId: '123',
      });

      expect(notification).toEqual({
        jsonrpc: '2.0',
        method: 'event.occurred',
        params: { eventId: '123' },
      });
    });

    it('should create a notification without params', () => {
      const notification = createJsonRpcNotification('ping');

      expect(notification).toEqual({
        jsonrpc: '2.0',
        method: 'ping',
      });
    });
  });

  describe('ErrorCodes', () => {
    it('should have the correct error codes', () => {
      expect(ErrorCodes.ParseError).toBe(-32700);
      expect(ErrorCodes.InvalidRequest).toBe(-32600);
      expect(ErrorCodes.MethodNotFound).toBe(-32601);
      expect(ErrorCodes.InvalidParams).toBe(-32602);
      expect(ErrorCodes.InternalError).toBe(-32603);
    });
  });
});
