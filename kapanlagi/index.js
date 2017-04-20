'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = "https://www.kapanlagi.com/";

//Remove elements (body)
const remove_elements = [
    '.gallery-preview',
    '.social-callout',
    'div.details-wrap',
    'div.gallery-descriptions-wrap',
    'iframe',
    'script',
    'ul.social-list',
];
//clean attr img
const remove_attr_img = [
    'class',
    'height',
    'sizes',
    'src',
    'srcset',
    'width',
];
//embbed content
const video_iframes = [
    'youtube', //YouTube
];

function ingest_post(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        // post uri
        asset.set_canonical_uri(uri);
        // Pull out the updated date
        const modified_date = $profile('.updated span.value-title').attr('title');
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        // section
        const section = $profile('meta[property="og:type"]').attr('content');
        asset.set_section(section);
        // main image
        const main_image_url = $profile('meta[property="og:image"]').attr('content');
        const main_image = libingester.util.download_image(main_image_url);
        hatch.save_asset(main_image);
        // reporter and date
        const metadata = $profile('div.hentry div.vcard').children();
        // post content
        const post_body = $profile('div.entertainment-detail-news').first();
        //download images
        post_body.find("img").map(function() {
            if (this.attribs.src) {
                const image = libingester.util.download_img(this, base_uri);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for(const attr of remove_attr_img){
                    delete this.attribs[attr];
                }
            }
        });
        // download videos
        const videos = post_body.find("iframe").map(function() {
            const iframe_src = this.attribs.src;
            for (const video_iframe of video_iframes) {
                if (iframe_src.includes(video_iframe)) {
                    const video_url = this.attribs.src;
                    const full_uri = url.format(video_url, { search: false })
                    const video_asset = new libingester.VideoAsset();
                    video_asset.set_canonical_uri(full_uri);
                    video_asset.set_last_modified_date(modified_date);
                    video_asset.set_title(title);
                    video_asset.set_download_uri(full_uri);
                    hatch.save_asset(video_asset);
                }
            }
        });
        //remove elements (body)
        for (const remove_element of remove_elements) {
            post_body.find(remove_element).remove();
        }
        // render template
        const content = mustache.render(template.structure_template, {
            title: title,
            main_image: main_image,
            metadata: metadata.html(),
            body: body.html(),
        });
        // save data
        asset.set_document(content);
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch();
    const post_urls = ['https://www.kapanlagi.com/intermezzone/bule-amerika-ini-nyoba-makan-buah-duku-ekspresinya-nggak-nahan-aee243.html'];
    Promise.all( post_urls.map((url) => ingest_post(hatch, url)) ).then( () => hatch.finish() );
}

main();
