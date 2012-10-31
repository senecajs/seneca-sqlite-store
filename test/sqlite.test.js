/* Copyright (c) 2012 Marius Ursache */

var common_tests = require('seneca/test/common.test');
var common   = require('seneca/lib/common');

var seneca   = require('seneca');
var shared   = require('seneca/test/store/shared');

//These tests assume a MySQL database/structure is already created.
/*
  $ sqlite3 /tmp/senecatest.db
  sqlite>
  CREATE TABLE foo (id VARCHAR(255), p1 VARCHAR(255), p2 VARCHAR(255));
  CREATE TABLE moon_bar (
    id VARCHAR(255),
    str VARCHAR(255),
    `int` INT,
    bol BOOLEAN,
    wen TIMESTAMP,
    mark VARCHAR(255),
    `dec` REAL,
    arr TEXT,
    obj TEXT);
  sqlite>
  .tables
*/

var config = {
  log:'print'
};

var si = seneca(config);

var senecaSQLiteStore = require('../lib/sqlite-store');
var senecaSQLiteStoreOpts = { database:'/tmp/senecatest.db'};

si.use(senecaSQLiteStore, senecaSQLiteStoreOpts);

si.__testcount = 0;
var testcount = 0;

module.exports = {
  basictest: (testcount++, shared.basictest(si)),
  extratest: (testcount++, extratest(si)),
  closetest: shared.closetest(si,testcount)
};

function extratest(si) {
  console.log('EXTRA')
  si.__testcount++
}