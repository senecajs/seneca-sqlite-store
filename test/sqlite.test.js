/* Copyright (c) 2012 Marius Ursache */

"use strict";

var seneca = require('seneca');
var shared = seneca.test.store.shared;

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

var senecaSQLiteStore = require('..');
var senecaSQLiteStoreOpts = { database:'/tmp/senecatest.db'};

si.use(senecaSQLiteStore, senecaSQLiteStoreOpts);

si.__testcount = 0;
var testcount = 0;

describe('sqlite', function(){
  it('basic', function(done){
    testcount++;
    shared.basictest(si,done);
  });

  it('extra', function(done){
    testcount++;
    extratest(si,done);
  });

  it('close', function(done){
    shared.closetest(si,testcount,done);
  });
});

function extratest(si,done) {
  console.log('EXTRA');
  si.__testcount++;
  return done();
}
