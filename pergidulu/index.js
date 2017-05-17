'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'https://www.pergidulu.com/';
const rss_feed = 'https://www.pergidulu.com/feed/'; //Artists

//Remove attributes (images)
const attr_image = [
    'class',
    'data-lazy-sizes',
    'data-lazy-src',
    'data-lazy-srcset',
    'height',
    'sizes',
    'src',
    'srcset',
    'width',
];

//Remove elements (body)
const remove_elements = [
    'div',
    'noscript',
    'script',
];

//Remove parents from these elements (body)
const rm_elem_parent = [
    'a.nectar-button',
    'span.guide-info-box',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const base_uri = libingester.util.get_doc_base_uri($, uri);
        const asset = new libingester.NewsArticle();

        // set title section
        const title = $('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);

        // pull out the updated date and section
        const modified_date = $('meta[property="article:published_time"]').attr('content');
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        const section = $('meta[property="article:section"]').attr('content');
        asset.set_section(section);

        // data for the template
        const info_article = $('div#single-below-header').first();
        const author = $(info_article).find('span.fn').text();
        const date = $(info_article).find('span.date').text();
        const category = $(info_article).find('span.meta-category').text();
        const body = $('div.post-content div.content-inner').first();

        // remove elements (body)
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }
        for (const elem of rm_elem_parent){
            body.find(elem).first().parent().remove();
        }

        // download images
        const img_width = '750w'; // 1600w, 800w, 750w, 320w,
        body.find("img").map(function() {
            const srcset = this.attribs['data-lazy-srcset'].split(', ');
            let src;
            for(const source of srcset){ // looking for a link containing 'img_width'
                if( source.indexOf(img_width) != -1 ){
                    const lastIndex = source.indexOf('jpg') + 3;
                    const firstIndex = source.indexOf('http');
                    src = source.substring(firstIndex, lastIndex);
                }
            }
            if( src == undefined ){ //If don't find the link it, set default link
                src = this.attribs['data-lazy-src'];
            }

            const image = libingester.util.download_image( src );
            this.attribs["data-libingester-asset-id"] = image.asset_id;
            for(const attr of attr_image){
                delete this.attribs[attr];
            }
            hatch.save_asset(image);
        });

        // render template
        const content = mustache.render(template.structure_template, {
            title: title,
            author: author,
            date: date,
            category: category,
            body: body.children(),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch();

    rss2json.load(rss_feed, function(err, rss){
        const news_uris =  rss.items.map((datum) => datum.url);
        Promise.all(news_uris.map((uri) => ingest_article(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();