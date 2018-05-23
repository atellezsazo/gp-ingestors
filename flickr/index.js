'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const fs = require('fs');
const url = require('url');

const BASE_URI = 'https://www.flickr.com';
const CREATIVE_COMMONS_PARAMETER = '&license=2%2C3%2C4%2C5%2C6%2C9';
const ADVANCED_SEARCH_PARAMETER = '&advanced=1';
const SEARCH_URI = '/search/?text=';
const IMG_SIZE = 'z'; // medium representative
const SIZES = ['m', 's', 'l', 'n'];
const DEFAULT_TITLE = 'All'; // if "search" is empty

let json_img_data = {};

function cleanStr(str) {
    return str.replace(/\//g, '|').replace(/https|http/g, '').replace(/;|:/g,'.').replace(/ /g, '_');
}

function get_image_data_by_search(uri) {
    return libingester.util.fetch_html(uri).then($ => {
        // parser json into script
        let script = $('script.modelExport').text(),
            str = script.substr(script.search('modelExport:') + 12),
            substr = str.substr(0, str.search('auth:')).trim(),
            i = substr.lastIndexOf(','),
            jsonData = substr.substr(0, i),
            data = JSON.parse(jsonData);

        let photo_list = data['main']['search-photos-lite-models'][0]['photos']['_data'];

        return photo_list.map(data_img => {
            // find a uri by size
            let defaultUri = "";
            if (IMG_SIZE in data_img.sizes) {
                defaultUri = data_img.sizes[IMG_SIZE].url;
            } else {
                for (let size of SIZES) {
                    if (size in data_img.sizes) {
                        defaultUri = data_img.sizes[size].url;
                    }
                }
                if (!defaultUri) {
                    return;
                }
            }
            // fix uri
            let uri_parse = url.parse(defaultUri);
            if (!uri_parse.protocol) uri_parse.protocol = 'https';
            let uri = url.format(uri_parse);
            // set meta
            let author = data_img.realname || data_img.username || '';
            let title = data_img.title || '';
            // generate filename
            let ext = uri.substr(uri.lastIndexOf('.') - 1);
            let index = ext.lastIndexOf('?');
            if (index > 0) ext = ext.substr(0, index);
            let fileName = cleanStr(author) + '__' + cleanStr(title) + ext;
            if (!fileName.endsWith('.jpg')) fileName += '.jpg';
            // return data
            return { fileName, author, title, uri, license: data_img.license };
        });
    });
}

function ingest(img_list, hatch, uri, search) {
    const asset = new libingester.GalleryImageArticle();
    const body = cheerio('<div></div>');

    // build a body
    img_list.map(img_data => {
        if (!img_data) return;
        const figure = cheerio('<figure></figure>');
        const image = cheerio(`<img src="${img_data.uri}" title="${img_data.title}"></figure>`);
        const figcaption = cheerio(`<figcaption></figcaption>`);

        if (img_data.author) {
            const pAuthor = cheerio(`<p><strong>${img_data.author}</strong></p>`);
            figcaption.append(pAuthor);
            if (img_data.title) {
                pAuthor.append(cheerio(`<br>${img_data.title}`));
            }
        }
        body.append(figure.append(image, figcaption));

        const img = libingester.util.download_img(image);
        img.set_title(img_data.title);
        hatch.save_asset(img);

        // json metadata
        json_img_data[img.asset_id] = img_data;
    });

    asset.set_title(search || DEFAULT_TITLE);
    asset.set_body(body);
    asset.set_canonical_uri(uri);
    asset.render();

    hatch.save_asset(asset);
}

// search String to find
function build_search_uri(search) {
    search = encodeURI(search || '');
    return BASE_URI + SEARCH_URI + search + ADVANCED_SEARCH_PARAMETER + CREATIVE_COMMONS_PARAMETER;
}

function main() {
    const search = process.argv[2] || '';
    const strSearch = search.replace(/ /, '_');
    const hatch = new libingester.Hatch('flickr_' + strSearch, 'en');
    const uri = build_search_uri(search);

    get_image_data_by_search(uri)
        .then(img_list => {
            ingest(img_list, hatch, uri, search);
            return img_list;
        })
        .then(data => {
            hatch.finish();
            fs.writeFileSync(hatch._path.replace('hatch','') + '.json', JSON.stringify(json_img_data));
        });
}

main();