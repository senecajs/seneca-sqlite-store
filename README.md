Seneca-SQLite is a SQLite database driver for [Seneca] MVP toolkit

Usage:

    var seneca              = require('seneca');
    var senecaSQLiteStore   = require('seneca-sqlite');

    var senecaConfig = {}
    var senecaSQLiteStoreOpts = {
        database:'/path/to/seneca_sqlite.db'
    };

    ...

    var si = seneca(senecaConfig);
    si.use(senecaSQLiteStore, senecaSQLiteStoreOpts);
    si.ready( function(){
        var product = si.make('product');
        ...
    });
    ...

[Seneca]: http://senecajs.org/