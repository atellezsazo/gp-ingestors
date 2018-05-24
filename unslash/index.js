'use strict';

const fs = require('fs');
const libingester = require('libingester');
const rp = require('request-promise');
const url = require('url');

const BASE_URL = 'https://unsplash.com';
const PATH_SEARCH = '/search/photos/';
const SEARCH_URL = url.resolve(BASE_URL, PATH_SEARCH);
const SIZE_PARAMETER = '&w=800';
const DEFAULT_TITLE = 'Trending';

let json_img_data = {};

function ingest(hatch, uri, search) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.GalleryImageArticle();
        const $body = $('<div></div>');
        const $main = $('div#gridMulti').first();

        const build_figcaption = (author, title) => {
            const $figcaption = $('<figcaption></figcaption>');
            const $p = $('<p></p>');
            if (author) {
                $p.append(`<strong>${author}</strong>`);
            }
            if (title) {
                $p.append( $p.text() ? '<br>' + title : title );
            }
            return $figcaption.append($p);
        }

        const build_body = (img) => {
            const $figure = $('<figure></figure>');
            const $img = $(`<img alt="${img.title}" src="${img.uri}">`);
            $figure.append($img, build_figcaption(img.author, img.title));
            $body.append($figure);
            return $img;
        }

        $main.find('figure').map((i, el) => {
            const $a = $(el).find('a').first();
            const $img = $(el).find('img[itemprop="thumbnailUrl"]').first();
            const srcset = $img.attr('srcset').split(' ');
            const author = ($a.attr('title') || '').replace('View the photo by ', '');
            const title = $img.attr('alt') || '';
            if (srcset.length > 0) {
                // build uri
                let uri = srcset[0], index = uri.search('&auto');
                if (index > 0) uri = uri.substr(0, index) + SIZE_PARAMETER;
                // build body
                let img = { author, title, uri }, $img = build_body(img);
                const image = libingester.util.download_img($img);
                image.set_title(title);
                hatch.save_asset(image);
                // json metadata
                json_img_data[image.asset_id] = img;
            }
        });

        asset.set_title(search || DEFAULT_TITLE);
        asset.set_body($body);
        asset.set_canonical_uri(uri);
        asset.render();

        hatch.save_asset(asset);
    })
}

function build_search_uri(search) {
    search = encodeURI(search || '');
    return url.resolve(SEARCH_URL, search);
}

function main() {
    const search = process.argv[2] || '';
    const strSearch = search.replace(/ /, '_');
    const hatch = new libingester.Hatch('unslash_' + strSearch, 'en');
    const uri = build_search_uri(search);

    ingest(hatch, uri, search).then(() => {
        hatch.finish();
        fs.writeFileSync(hatch._path.replace('hatch','') + '.json', JSON.stringify(json_img_data));
    });
}

main();