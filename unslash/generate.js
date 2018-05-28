'use strict';

const fs = require('fs');
const excel = require('exceljs');
const url = require('url');

function copy(path1, path2) {
    if (fs.existsSync(path1)) {
        const rs = fs.createReadStream(path1);
        rs.on('error', e => {});
        const ws = fs.createWriteStream(path2, {encoding: null});
        ws.on('error', e => {});
        rs.pipe(ws);
    };
}

function read_file_promise(path) {
    return new Promise((resolve, reject) => {
        fs.readFile(path, 'utf8', (err, data) => {
            if (err) {
                return reject(err);
            }
            resolve(data);
        });
    })
}

function random() {
    return Math.random().toString().substr(2,10);
}

function clean_str(str) {
    return str.replace(/\//g, '|').replace(/https|http/g, '').replace(/;|:/g,'.').replace(/ /g, '_');
}

function generate_filename(author='', title='', options) {
    let ext = '.' + options.ext;
    // fix uri
    if (options.uri) {
        let uri = options.uri;
        ext = uri.substr(uri.lastIndexOf('.'));
        // delete parameters
        let index = ext.lastIndexOf('?');
        if (index > 0) ext = ext.substr(0, index);
    }
    // clean
    author = clean_str(author);
    title = clean_str(title);
    let filename = '';
    // build filename
    if (!author && !title) filename = random() + ext;
    if (options.random) filename = author + '_•_' + title + '_' + random() + ext;
    else filename = author + '_•_' + title + ext;
    return ((filename.length > 250) ? filename.substr(0, 249) : filename) + ext;
}

function generate_excel(data, destination_folder) {
    const workbook = new excel.Workbook();
    const date = new Date();
    // properties
    workbook.creator = 'generate.js';
    workbook.lastModifiedBy = 'generate.js';
    workbook.created = date;
    workbook.modified = date;

    workbook.views = [
        {
            x: 0, y: 0, width: 10000, height: 20000,
            firstSheet: 0, activeTab: 1, visibility: 'visible'
        }
    ];

    const worksheet = workbook.addWorksheet('Sheet1');
    const columnImage = 'B';
    const borderStyle = { style:'thin' };
    const headerContentStyle = {
        alignment: {
            wrapText: true,
            vertical: 'top',
            horizontal: 'left'
        },
        border: {
            top: borderStyle,
            left: borderStyle,
            bottom: borderStyle,
            right: borderStyle
        }
    };
    const headerContent = [
        { header: 'No', key: '0', width: 10, style: headerContentStyle},
        { header: 'Thumbnail', key: '5', width: 25, style: headerContentStyle },
        { header: 'Author', key: '1', width: 25, style: headerContentStyle},
        { header: 'Filename', key: '2', width: 40, style: headerContentStyle },
        { header: 'Image name', key: '3', width: 40, style: headerContentStyle },
        { header: 'Link', key: '4', width: 60, style: headerContentStyle }
    ];
    const headerStyle = {
        font: {
            name: 'Arial Black',
            bold: true,
            size: 14,
            color: {
                argb: '00FFFFFF'
            }
        },
        alignment: {
            vertical: 'middle',
            horizontal: 'center'
        },
        border: {
            top: borderStyle,
            left: borderStyle,
            bottom: borderStyle,
            right: borderStyle
        },
        fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor:{
                argb: '00ff9900'
            }
        }
    }

    // create columns
    worksheet.columns = headerContent;
    worksheet.getCell('A1').style = headerStyle;
    worksheet.getCell('B1').style = headerStyle;
    worksheet.getCell('C1').style = headerStyle;
    worksheet.getCell('D1').style = headerStyle;
    worksheet.getCell('E1').style = headerStyle;
    worksheet.getCell('F1').style = headerStyle;
    worksheet.getRow(1).height = 25;

    let oneColumn = {};
    let numRow = 2;
    for (let i in data) {
        let d = data[i];
        let toIncert = {'0': numRow - 1};
        for (let cell in d) {
            switch(cell) {
                case 'author': toIncert['1'] = d[cell]; break;
                case 'fileName': toIncert['2'] = d[cell]; break;
                case 'title': toIncert['3'] = d[cell]; break;
                case 'uri': toIncert['4'] = d[cell]; break;
            }
        }
        let imageId1 = workbook.addImage({
            filename: destination_folder + toIncert['2'],
            extension: 'jpeg',
        });
        let range = columnImage + numRow + ':' + columnImage + numRow;
        worksheet.addImage(imageId1, range);
        worksheet.addRow(toIncert);
        worksheet.getRow(numRow).height = 100;
        numRow++;
    }

    return workbook.xlsx.writeFile(destination_folder + 'excel.xlsx');
}

function hatch_rename(name) {
    return name.replace('hatch','hatch_gp');
}

function main() {
    const argv1 = process.argv[1];
    const this_path = argv1.substr(0, argv1.lastIndexOf('/')) + '/';
    const folder = process.argv[2];

    if (!folder) {
        throw "A folder is require";
    }

    const origin_folder = decodeURI(url.resolve(this_path, folder) + '/');
    const path_manifest = origin_folder + 'hatch_manifest.json';
    const path_data = this_path + '/' + hatch_rename(folder) + '.json';

    let data;
    let exists_manifest = fs.existsSync(path_manifest);
    let exists_data = fs.existsSync(path_data);
    if (!exists_manifest || !exists_data) return console.log("Not Generate");

    read_file_promise(path_data).then(d => {
        const data = JSON.parse(d);
        const destination_folder = decodeURI(url.resolve(this_path, hatch_rename(folder)) + '/');
        const f = destination_folder.split('/');
        const finished_folder = f[f.length - 2];

        // creating dir
        if (!fs.existsSync(destination_folder)) {
            fs.mkdirSync(destination_folder);
        } else {
            return console.log(`This directory "${finished_folder}" already exists.`);
        }

        // copy images to the new folder
        let destination_files = [];
        for (let asset_id in data) {
            const meta = data[asset_id];
            if (meta) {
                const p1 = origin_folder + asset_id + '.data';
                let filename = generate_filename(meta.author, meta.title, {ext: 'jpg'});
                let p2 = destination_folder + filename;
                if (destination_files.indexOf(filename) >= 0) {
                    filename = generate_filename(meta.author, meta.title, {ext: 'jpg', random: true});
                    p2 = destination_folder + filename;
                }
                meta.fileName = filename;
                destination_files.push(filename);
                copy(p1, p2);
            }
        }

        // EXCEL.xlsx
        generate_excel(data, destination_folder).then(function() {
            console.log("Finished, saved to " + finished_folder);
        });
    });
}

main();