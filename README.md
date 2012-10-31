Seneca-SQLite is a SQLite database driver for [Seneca] MVP toolkit

Usage:

    var seneca              = require('seneca');
    var senecaSQLiteStore   = require('sqlite-store');

    var senecaConfig = {}
    var senecaSQLiteStoreOpts = {
        database:'/path/to/seneca_sqlite.db'
    };

    ...

    var si = seneca(senecaConfig);
    si.use(senecaSQLiteStore, senecaSQLiteStoreOpts);

    ...

[Seneca]: http://senecajs.org/