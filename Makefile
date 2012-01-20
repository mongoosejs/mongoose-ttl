TESTS = test/*.js

test:
	@./node_modules/.bin/mocha --reporter list --require should $(TESTFLAGS) $(TESTS)

.PHONY: test
