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

    let manifest, data;
    const readManifest = read_file_promise(origin_folder + 'hatch_manifest.json').then(d => {
        manifest = JSON.parse(d);
    });
    const readData = read_file_promise(this_path + '/' + hatch_rename(folder) + '.json').then(d => {
        data = JSON.parse(d);
    });

    Promise.all([readManifest, readData]).then(() => {
        const destination_folder = decodeURI(url.resolve(this_path, hatch_rename(folder)) + '/');
        const f = destination_folder.split('/');
        const finished_folder = f[f.length - 2];

        // creating dir
        if (!fs.existsSync(destination_folder)) {
            fs.mkdirSync(destination_folder);
        } else {
            return console.log(`This directory "${finished_folder}" already exists.`);
        }

        const random = () => Math.random().toString().substr(2,10);

        // copy images to the new folder
        let destination_files = [];
        manifest.assets.forEach(d => {
            const p1 = origin_folder + d.asset_id + '.data';
            const meta = data[d.asset_id];
            if (meta) {
                let name = meta.fileName;
                let p2 = destination_folder + name;
                if (destination_files.indexOf(p2) >= 0) {
                    name = name.replace('.jpg', '_' + random() + '.jpg');
                    meta.fileName = name;
                    p2 = destination_folder + name;
                }
                destination_files.push(p2);
                copy(p1, p2);
            }
        });

        // EXCEL.xlsx
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

        workbook.xlsx.writeFile(destination_folder + 'excel.xlsx')
            .then(function() {
                console.log("Finished, saved to " + finished_folder);
            });
    });
}

main();