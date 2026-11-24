import { AppController } from './app.controller';

describe('AppController', () => {
  const controller = new AppController();

  it('getStatus → API running', () => {
    expect(controller.getStatus()).toEqual({ success: true, message: 'API running 🚀' });
  });
});
