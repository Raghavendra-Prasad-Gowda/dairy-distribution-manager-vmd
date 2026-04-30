'use strict';

/**
 * Creates a simple async mock function — lightweight replacement for jest.fn()
 * that works with any test runner including Playwright.
 */
function mockFn() {
  let _resolvedValue;
  let _rejectedError;
  let _impl;
  let _hasError = false;

  const fn = async (...args) => {
    if (_impl) return _impl(...args);
    if (_hasError) throw _rejectedError;
    return _resolvedValue;
  };

  fn.mockResolvedValue = (val) => {
    _resolvedValue = val;
    _hasError = false;
    _impl = undefined;
    return fn;
  };

  fn.mockRejectedValue = (err) => {
    _rejectedError = err;
    _hasError = true;
    _impl = undefined;
    return fn;
  };

  fn.mockImplementation = (impl) => {
    _impl = impl;
    _hasError = false;
    return fn;
  };

  fn.reset = () => {
    _resolvedValue = undefined;
    _rejectedError = undefined;
    _impl = undefined;
    _hasError = false;
  };

  return fn;
}

module.exports = { mockFn };
