    const { Client } = require('pg');
    const client = new Client({
      user: 'bpipe',
      host: '10.11.6.66',
      database: 'bpipe',
      password: 'bpipe',
      port: 5432,
    });

    client.connect()
      .then(() => console.log('Berhasil terhubung ke database'))
      .catch(err => console.error('Error koneksi database', err));


    

    async function getTableColumns(tableName) {
      const query = `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `;
      const res = await client.query(query, [tableName]);
      return res.rows;
    }

    getTableColumns('day_status').then(columns => {
      console.log(`Kolom-kolom untuk tabel '${'nama_tabel_anda'}':`);
      columns.forEach(col => {
        console.log(`- Nama: ${col.column_name}, Tipe Data: ${col.data_type}`);
      });
    }).catch(err => console.error('Error mengambil kolom tabel', err));

    // Panggil fungsi-fungsi tersebut
    getTableColumns('day_status');
    //getAllTables();
    // getTableData('nama_tabel_anda'); // Ganti dengan nama tabel yang ingin Anda lihat