import { EventEmitter } from 'events';
import { observeStreamCompletion, type StreamCompletionEvent } from './stream-completion.util';

describe('observeStreamCompletion', () => {
  function setup(statusCode = 200) {
    const stream = new EventEmitter();
    const response = Object.assign(new EventEmitter(), { statusCode, writableFinished: false });
    const events: StreamCompletionEvent[] = [];
    observeStreamCompletion(stream, response, (event) => events.push(event));
    return { stream, response, events };
  }

  it('counts a body that finished writing as completed', () => {
    const { response, events } = setup();
    response.writableFinished = true;
    response.emit('finish');
    expect(events).toEqual(['completed']);
  });

  it('reports a 4xx or 5xx response as failed even when it reaches finish', () => {
    // A rejected read is served as an error response; the client got no file.
    for (const statusCode of [400, 404, 500]) {
      const { response, events } = setup(statusCode);
      response.writableFinished = true;
      response.emit('finish');
      expect(events).toEqual(['failed']);
    }
  });

  it('reports a stream read error as failed', () => {
    // The guard on the stream is the only path that can see a mid-read failure:
    // `error` fires before `finish`/`close`, and without this listener the event
    // is unhandled and the download is never recorded as failed.
    const { stream, events } = setup();
    stream.emit('error');
    expect(events).toEqual(['failed']);
  });

  it('does not count a connection closed before the body finished', () => {
    const { response, events } = setup();
    response.emit('close');
    expect(events).toEqual(['failed']);
  });

  it('reports exactly one terminal event when finish is followed by close', () => {
    const { response, events } = setup();
    response.writableFinished = true;
    response.emit('finish');
    response.emit('close');
    expect(events).toEqual(['completed']);
  });

  it('reports exactly one failed event when a read error is followed by close', () => {
    const { stream, response, events } = setup();
    stream.emit('error');
    response.emit('close');
    expect(events).toEqual(['failed']);
  });

  it('keeps the first verdict when a read error follows a finished body', () => {
    const { stream, response, events } = setup();
    response.writableFinished = true;
    response.emit('finish');
    stream.emit('error');
    expect(events).toEqual(['completed']);
  });
});
