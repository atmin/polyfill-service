'use strict';

module.exports = function(grunt) {

	var wd = require('wd');
	var Batch = require('batch');
	var request = require('request');
	var SauceTunnel = require('sauce-tunnel');

	grunt.registerMultiTask('saucelabs', 'Perform tests on Sauce', function() {
		var done = this.async();
		var nameSuffix = process.env.TRAVIS_BUILD_NUMBER ? "-travis-build:" + process.env.TRAVIS_BUILD_NUMBER : ':' + (new Date()).toUTCString();
		var tunnelId = 'SauceTunnel-' + nameSuffix;

		var options = this.options({
			name: 'grunt-test' + nameSuffix,
			build: null,
			user: process.env.SAUCE_USER_NAME,
			key: process.env.SAUCE_API_KEY,
			browsers: [],
			url: '',
			concurrency: 2,
			tags: [],
			video: false,
			screenshots: false
		});


		var batch = new Batch();
		batch.concurrency(options.concurrency);

		var tunnel = new SauceTunnel(options.user, options.key, tunnelId, true);

		grunt.log.writeln('Opening tunnel to Sauce Labs');
		tunnel.start(function(status) {

			console.log("Tunnel Started");
			if (status !== true)  {
				done(status);
			}

			options.browsers.forEach(function(conf) {

				conf['name'] = options.name;
				conf['record-video'] = options.video;
				conf['record-screenshots'] = options.screenshots;
				conf['tunnel-identifier'] = tunnelId;
				if (options.tags) conf['tags'] = options.tags;
				if (options.build) conf['build'] = options.build;

				batch.push(function(done) {

					// initialize remote connection to Sauce Labs
					var sauceConnectPort = 4445;
					var browser = wd.remote("127.0.0.1", sauceConnectPort, options.user, options.key);
					grunt.log.writeln('Initialising browser %s %s %s', conf.browserName, conf.version, conf.platform);

					browser.init(conf, function() {
						grunt.log.writeln('Running %s %s %s', conf.browserName, conf.version, conf.platform);

						grunt.log.writeln('Open %s', options.url);
						browser.get(options.url, function(err) {
							if (err) return done(err);

							// Wait until results are available
							(function waitOnResults() {

								browser.eval('window.global_test_results', function(err, data) {

									if (!data) return setTimeout(waitOnResults, 1000);

									if (err) return done(err);


									console.log("Setting job results on Sauce");
									// Update Sauce Labs job with custom test data
									request({
										method: "PUT",
										uri: ["https://", options.user, ":", options.key, "@saucelabs.com/rest", "/v1/", options.user, "/jobs/", browser.sessionID].join(''),
										headers: {'Content-Type': 'application/json'},
										body: JSON.stringify({
											'custom-data': { custom: data },
											'passed': !data.failed
										})
									}, function (err, res, body) {

										// TODO: write test data to disk, maybe /test/results/<browser>.json?
										// TODO: Then another grunt task to read all the result data and output a single compatibility data file in /docs/assets/compat.json?  We then gitignore the test/results directory but commit the docs/assets dir.
										console.log("Test data written to Sauce");

										browser.quit();
										tunnel.stop(function() {
											done(!!err);
										});
									});
								});
							}());

						});
					});
				});
			});

			batch.end(done);
		});
	});
};