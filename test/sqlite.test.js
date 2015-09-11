/*jslint node: true */
/*global describe:true, it:true */
/* Copyright (c) 2012 Marius Ursache */

"use strict";

var seneca = require('seneca');
var lab = exports.lab = require('lab').script();
var shared = require('seneca-store-test');
var path    =  require('path');
var senecaSQLiteStore = require('..');
var describe = lab.describe;
var it = lab.it;
var si = seneca(/*{log:'silent'}*/);

si.use(senecaSQLiteStore, {database:path.join(__dirname, '/db/senecatest.db')});

si.__testcount = 0;
var testcount = 0;

describe('sqlite', function(){
  it('basic', function(done){
    testcount++;
    shared.basictest(si, done);
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
