/* Copyright (c) 2012 Marius Ursache */
"use strict";

// TODO: add some methods to create the test structure

// var common  = require('seneca/lib/common');
// var Store   = require('seneca').Store;
var sqlite  = require('sqlite3');

var _       = require('underscore');
var uuid    = require('node-uuid');
var eyes    = require('eyes');

var name    = "sqlite-store";

var MIN_WAIT = 16;
var MAX_WAIT = 65336;

module.exports = function (opts, register) {
  var seneca;
  var desc, dbmap = {}, seneca = this;
  var connection;
  var self = this;

  opts = this.util.deepextend({
    folder:'.',
    encoding:'json',
    sync:false,
    fillCache:true
  }, opts);

  var store = {
    name:name,

/*
  self.init = function(si, opts, cb) {
    parent.init(si, opts, function(){

      // keep a reference to the seneca instance
      seneca = si;

      self.configure(opts, function(err) {
        if(err) {
          return seneca.fail({code:'entity', store:self.name, error:err}, cb);
        }
        else return cb();
      });
    });
  };

    init: function(){

    },

    config: function(){

    },
    */

    configure: function(spec, done){
      self.spec = spec;

      var conf = 'string' == typeof(spec) ? null : spec;

      if(!conf) {
        conf = {};
        //sqlite:///path/to/database;
        var urlM = /^sqlite:\/\/(.*?)$/.exec(spec);
        conf.database   = urlM[1];
      }

      eyes.inspect(conf, "conf");

      self.connection = new sqlite.Database(conf.database, function(err){
        if(err) return done(err);

        self.waitmillis = MIN_WAIT;

        seneca.log.debug({tag$:'init'}, 'db '+conf.database+' opened.');
        return done(null, self);
      });
    },

    /** load the first matching entity */
    load: function(args, done){
      var q    = _.clone(args.q);
      var qent = args.qent;
      q.limit$ = 1;

      var query = selectstm(qent, q);
      self.connection.get(query.text, query.values, function(err, row){
        if (err) {
          //retun seneca.fail({code:'load',tag:args.tag$,store:self.name,query:query,error:err}, cb);
          return done(err);
        }

        //var ent = makeent(qent, row);
        var fent = qent.make$(row);
        seneca.log.debug('load', q, fent, desc);
        return done(null, fent);
      });
    },

    list: function(args, done){    
      var qent  = args.qent;
      var q     = args.q;
      var query = selectstm(qent, q);

      self.connection.all(query.text, query.values, function(err, results){
        if (err) {
          return done(err);
        } else{
          var list = [];
          results.forEach(function(row){
            // var ent = makeent(qent, row);
            // list.push(ent);
            list.push(qent.make$(row));
          });
          return done(null, list);
        }
      });
    },

    remove: function(args, done){
      var qent = args.qent;
      var q    = args.q;
      var query= deletestm(qent, q);

      self.connection.run(query.text, query.values, function(err, result) {
        if (err) {
          return done(err);
        } else {
          return done(null, result);
        }
      });
    },

    save: function(args, done){
      // entity to save
      var ent  = args.ent;
      var q    = args.q;

      var entp = {};

    //var canon = ent.canon$({object:true})

      var update = true;
      if( !ent.id ) {
        update = false;
        ent.id = uuid();
      }

      // TODO: move to Store
      var fields = ent.fields$();
      var query;
      entp = makeentp(ent);
      var qlabel = 'update';

      if (update) {
        // id received - execute an update
        query = updatestm(ent);
      } else {
      // no id received - execute an insert
        query = savestm(ent);
        qlabel = 'insert';
      }

      self.connection.run(query.text, query.values, function(err, result) {
        if (err) {
          return done(err);
        } else {
          seneca.log.debug('save/'+qlabel, query, desc);
          return done(null, ent);
        }
      });
    },

    close: function(args, done){
      if(self.connection) {
        self.connection.close(function(err) {
          if (err) {
            return done(err);
          } else {
            return done(null, null);
          }
        });
      } else {
        return done(null, null);
      }
    },

    native: function(args, done){
      return done(null, self.connecation);
    }
  };

  var selectstm = function(qent,q) {
    var stm = {};
    var table = tablename(qent);
    var params = [];
    var values = {};

    var w = whereargs(makeentp(qent),q);
    var wherestr = '';

    if( !_.isEmpty(w) ) {
      for(var param in w) {
        var fieldPlaceholder = '$' + param;
        params.push(param + ' = ' + fieldPlaceholder);
        values[fieldPlaceholder] = w[param];
      }

      wherestr = " WHERE " + params.join(' AND ');
    }

    var mq = metaquery(qent, q);
    var metastr = ' ' + mq.join(' ');

    stm.text = "SELECT * FROM " + table + wherestr + metastr;
    stm.values = values;

    return stm;
  };

  var whereargs = function(qent, q) {
    var w = {};

    var qok = fixquery(qent,q);

    for(var p in qok) {
      w[p] = qok[p];
    }

    return w;
  };

  var fixquery = function(qent, q) {
    var qq = {};
    for( var qp in q ) {
      if( !qp.match(/\$$/) ) {
        qq[qp] = q[qp];
      }
    }
    return qq;
  };

  var metaquery = function(qent,q) {
    var mq = [];

    if( q.sort$ ) {
      for( var sf in q.sort$ ) break;
      var sd = q.sort$[sf] < 0 ? 'ASC' : 'DESC';
      mq.push('ORDER BY '+sf+' '+sd);
    }

    if( q.limit$ ) {
      mq.push('LIMIT '+q.limit$);
    }

    return mq;
  };

  var savestm = function(ent) {
    var stm = {};

    var table  = tablename(ent);
    var fields = ent.fields$();
    var entp   = makeentp(ent);

    var values = {};
    var params = [];

    fields.forEach(function(field) {
      var fieldPlaceholder = '$'+field;
      values[fieldPlaceholder] = entp[field];
      params.push(fieldPlaceholder);
    });

    stm.text   = 'INSERT INTO ' + table + ' (' + fields + ') values (' + params + ')';
    stm.values = values;

    return stm;
  };


  var updatestm = function(ent) {
    var stm = {};

    var table  = tablename(ent);
    var fields = ent.fields$();
    var entp   = makeentp(ent);

    var values = {};
    var params = [];

    fields.forEach( function(field) {
      if( !(_.isUndefined(ent[field]) || _.isNull(ent[field])) ) {
        var fieldPlaceholder = '$'+field;
        values[fieldPlaceholder] = entp[field];
        params.push(field + ' = ' + fieldPlaceholder);
      }
    });

    values['$id'] = ent.id;

    stm.text   = "UPDATE " + table + " SET " + params + " WHERE id = $id";
    stm.values = values;

    return stm;
  };

  var deletestm = function(qent,q) {
    var stm = {};
    var table = tablename(qent);
    var params = [];
    var values = {};

    var w = whereargs(makeentp(qent),q);
    var wherestr = '';

    if( !_.isEmpty(w) ) {
      for(var param in w) {
        //params.push(param + ' = ' + self.connection.escape(w[param]));
        var fieldPlaceholder = '$' + param;
        params.push(param + ' = ' + fieldPlaceholder);
        values[fieldPlaceholder] = w[param];
      }

      wherestr = " WHERE " + params.join(' AND ');
    }

    var limistr = '';
    if( !q.all$ ) {
      // Sqlite does not have support for LIMIT in DELETE
      // (unless is explicitly compiled)
      limistr = '';
    }

    stm.text = "DELETE FROM " + table + wherestr + limistr;
    stm.values = values;

    return stm;
  };


  var tablename = function (entity) {
    var canon = entity.canon$({object:true});
    return (canon.base?canon.base+'_':'')+canon.name;
  };

  seneca.store.init(seneca, opts, store, function(err, tag, description){
    if(err) return register(err);

    desc = description;

    store.configure(opts, function(err) {
        if(err) {
          return register (err);
        }
        // else return cb();

        return register(null, {name:store.name, tag:tag});
      });

  });
};

function SQLiteStoreOld() {
  var self   = new Store();
  var parent = self.parent();

  var inid   = common.idgen(12);
  var seneca;
  var connection;

  self.name  = 'sqlite-store';

  /** create or update an entity */
  self.save$ = function(args,cb){
    // entity to save
    var ent  = args.ent;
    var q    = args.q;

    var entp = {};

    //var canon = ent.canon$({object:true})

    var update = true;
    if( !ent.id ) {
      update = false;
      ent.id = uuid();
    }

    // TODO: move to Store
    var fields = ent.fields$();
    var query;
    entp = makeentp(ent);

    if (update) {
      // id received - execute an update
      query = updatestm(ent);
      self.connection.run(query.text, query.values, function(err, result) {
        if (err) {
          return seneca.fail({code:'save/update', tag:args.tag$,
            store:self.name, query:query, fields:fields, error:err}, cb);
        } else {
          seneca.log(args.tag$,'save/update', result);
          return cb(null, ent);
        }
      });
    }
    else {
      // no id received - execute an insert

      query = savestm(ent);
      self.connection.run(query.text, query.values, function(err, result) {
        if ( err ){
          return seneca.fail(
            {code:'save/insert', tag:args.tag$, store:self.name,
            query:query, fields:fields, error:err}, cb);
        }
        else {
          seneca.log(args.tag$, 'save/insert', result, query);
          return cb(null, ent);
        }
      });
    }
  };

  /** load the first matching entity */
  self.load$ = function( args, cb ){
    var q    = _.clone(args.q);
    var qent = args.qent;
    q.limit$ = 1;

    var query= selectstm(qent,q);
    self.connection.get(query.text, query.values, function(err, row){
      if (err) {
        seneca.fail({code:'load',tag:args.tag$,store:self.name,query:query,error:err}, cb);
      } else{
        var ent = makeent(qent, row);
        seneca.log(args.tag$, 'load', ent);
        cb(null, ent);
      }
    });
  };

  /** load all matching entities */
  self.list$ = function( args, cb ){
    var qent  = args.qent;
    var q     = args.q;
    var query = selectstm(qent, q);

    self.connection.all(query.text, query.values, function(err, results){
      if (err) {
        seneca.fail( {code:'list',tag:args.tag$,store:self.name,query:query,error:err},cb );
      } else{
        var list = [];
        results.forEach( function(row){
          var ent = makeent(qent, row);
          list.push(ent);
        });
        cb(null, list);
      }
    });
  };

  /** remove all matching entities */
  self.remove$ = function(args,cb){
    var qent = args.qent;
    var q    = args.q;
    var query= deletestm(qent, q);

    self.connection.run(query.text, query.values, function(err, result) {
      if (err){
        seneca.fail({code:'remove', tag:args.tag$, store:self.name,
          query:query, error:err}, cb);
      } else {
        cb(null, result);
      }
    });
  };


  /** close connection to data store - called during shutdown */
  self.close$ = function( args, cb ){
    if( self.connection ) {
      self.connection.close(function ( err ) {
        if ( err ) {
          seneca.fail( {code:'connection/end',store:self.name,error:err},cb );
        }
        else cb();
      });
    }
    else cb();
  };

var savestm = function(ent) {
    var stm = {};

    var table  = tablename(ent);
    var fields = ent.fields$();
    var entp   = makeentp(ent);

    var values = {};
    var params = [];

    fields.forEach(function(field) {
      var fieldPlaceholder = '$'+field;
      values[fieldPlaceholder] = entp[field];
      params.push(fieldPlaceholder);
    });

    stm.text   = 'INSERT INTO ' + table + ' (' + fields + ') values (' + params + ')';
    stm.values = values;

    return stm;
  };

  var updatestm = function(ent) {
    var stm = {};

    var table  = tablename(ent);
    var fields = ent.fields$();
    var entp   = makeentp(ent);

    var values = {};
    var params = [];

    fields.forEach( function(field) {
      if( !(_.isUndefined(ent[field]) || _.isNull(ent[field])) ) {
        var fieldPlaceholder = '$'+field;
        values[fieldPlaceholder] = entp[field];
        params.push(field + ' = ' + fieldPlaceholder);
      }
    });

    values['$id'] = ent.id;

    stm.text   = "UPDATE " + table + " SET " + params + " WHERE id = $id";
    stm.values = values;

    return stm;
  };

  var deletestm = function(qent,q) {
    var stm = {};
    var table = tablename(qent);
    var params = [];
    var values = {};

    var w = whereargs(makeentp(qent),q);
    var wherestr = '';

    if( !_.isEmpty(w) ) {
      for(var param in w) {
        //params.push(param + ' = ' + self.connection.escape(w[param]));
        var fieldPlaceholder = '$' + param;
        params.push(param + ' = ' + fieldPlaceholder);
        values[fieldPlaceholder] = w[param];
      }

      wherestr = " WHERE " + params.join(' AND ');
    }

    var limistr = '';
    if( !q.all$ ) {
      // Sqlite does not have support for LIMIT in DELETE
      // (unless is explicitly compiled)
      limistr = '';
    }

    stm.text = "DELETE FROM " + table + wherestr + limistr;
    stm.values = values;

    return stm;
  };

  var selectstm = function(qent,q) {
    var stm = {};
    var table = tablename(qent);
    var params = [];
    var values = {};

    var w = whereargs(makeentp(qent),q);
    var wherestr = '';

    if( !_.isEmpty(w) ) {
      for(var param in w) {
        var fieldPlaceholder = '$' + param;
        params.push(param + ' = ' + fieldPlaceholder);
        values[fieldPlaceholder] = w[param];
      }

      wherestr = " WHERE " + params.join(' AND ');
    }

    var mq = metaquery(qent, q);
    var metastr = ' ' + mq.join(' ');

    stm.text = "SELECT * FROM " + table + wherestr + metastr;
    stm.values = values;

    return stm;
  };


  var metaquery = function(qent,q) {
    var mq = [];

    if( q.sort$ ) {
      for( var sf in q.sort$ ) break;
      var sd = q.sort$[sf] < 0 ? 'ASC' : 'DESC';
      mq.push('ORDER BY '+sf+' '+sd);
    }

    if( q.limit$ ) {
      mq.push('LIMIT '+q.limit$);
    }

    return mq;
  };


  var tablename = function (entity) {
    var canon = entity.canon$({object:true});
    return (canon.base?canon.base+'_':'')+canon.name;
  };

  var whereargs = function(qent, q) {
    var w = {};

    var qok = fixquery(qent,q);

    for(var p in qok) {
      w[p] = qok[p];
    }

    return w;
  };


  var fixquery = function(qent, q) {
    var qq = {};
    for( var qp in q ) {
      if( !qp.match(/\$$/) ) {
        qq[qp] = q[qp];
      }
    }
    return qq;
  };


  self.configure = function( spec, cb ) {
    self.spec = spec;

    var conf = 'string' == typeof(spec) ? null : spec;

    if(!conf) {
      conf = {};
      //sqlite:///path/to/database;
      var urlM = /^sqlite:\/\/(.*?)$/.exec(spec);
      conf.database   = urlM[1];
    }

    self.connection = new sqlite.Database(conf.database, function(err){
      if(!error({tag$:'init'}, err, cb)) {
        self.waitmillis = MIN_WAIT;

        if(err) {
          cb(err);
        } else {
          seneca.log({tag$:'init'}, 'db '+conf.database+' opened.');
          cb(null, self);
        }
      } else {
        seneca.log({tag$:'init'}, 'db open');
        cb(null, self);
      }
    });
  };


  function reconnect(){
    self.configure(self.spec, function(err, me){
      if( err ) {
        seneca.log(null, 'db reconnect (wait ' + self.waitmillis + 'ms) failed: ' + err);
        self.waitmillis = Math.min(2 * self.waitmillis, MAX_WAIT);
        setTimeout(
          function(){
            reconnect();
          }, self.waitmillis);
      }
      else {
        self.waitmillis = MIN_WAIT;
        seneca.log(null, 'reconnect ok');
      }
    });
  }


  function error(args, err, cb) {
    if(err) {
      if (!err.fatal) {
        return false;
      }

      seneca.log(args.tag$, 'error: ' + err);
      seneca.fail({code:'entity/error', store:self.name}, cb);
      return true;
    }

    return false;
  }

  /** called by seneca to initialise plugin */
  self.init = function(si, opts, cb) {
    parent.init(si, opts, function(){

      // keep a reference to the seneca instance
      seneca = si;

      self.configure(opts, function(err) {
        if(err) {
          return seneca.fail({code:'entity', store:self.name, error:err}, cb);
        }
        else return cb();
      });
    });
  };

  return self;
}

var makeentp = function(ent) {
    var entp = {};
    var fields = ent.fields$();

    fields.forEach(function(field){
      if( !_.isDate(ent[field]) && _.isObject(ent[field]) ) {
        entp[field] = JSON.stringify(ent[field]);
      } else {
        entp[field] = ent[field];
      }
    });

    return entp;
  };

var makeent = function(ent,row) {
    var entp;

    var fields = ent.fields$();

    if( !_.isUndefined(ent) && !_.isUndefined(row) ) {
      entp = {};
      fields.forEach(function(field){
        if( !_.isUndefined(row[field]) ) {
          if(_.isDate(ent[field])){
            entp[field] = new Date(JSON.parse(row[field]));
          } else if( _.isObject(ent[field]) ) {
            entp[field] = JSON.parse(row[field]);
          } else {
            entp[field] = row[field];
          }
        }
      });
    }

    return ent.make$(entp);
};


// module.exports = new SQLiteStore();
