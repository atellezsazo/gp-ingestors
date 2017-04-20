'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = "http://all-that-is-interesting.com/";

//Remove elements (body)
const remove_elements = [
    '.gallery-preview',
    '.related-posts',
    '.social-callout',
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

function ingest_post_body(hatch, uri, body_pages) {
    return new Promise(function(resolve, reject){
        libingester.util.fetch_html(uri).then(($profile) => {
            const post_body = $profile('article.post-content');
            //remove elements (body)
            post_body.find('hr').next().remove();
            post_body.find('hr').remove();
            for (const remove_element of remove_elements) {
                post_body.find(remove_element).remove();
            }
            //download images
            post_body.find("img").map(function() {
                if (this.attribs.src) {
                    let index = this.attribs.src.lastIndexOf('http');
                    this.attribs.src = this.attribs.src.substring(index);
                    const description = this.parent.attribs['aria-describedby'];
                    const image = libingester.util.download_img(this, base_uri);
                    if( description ){ //save image info
                        const id = 'div#'+description;
                        const info_img = $profile(id).first();
                        if( info_img[0] )
                            this.parent.children.push(info_img[0]);
                    }
                    hatch.save_asset(image);
                    this.attribs["data-libingester-asset-id"] = image.asset_id;
                    for(const attr of remove_attr_img){
                        delete this.attribs[attr];
                    }
                }
            });
            // download videos
            const modified_date = $profile('meta[property="article:modified_time"]').attr('content');
            const title = $profile('meta[property="og:title"]').attr('content');
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
            //save body
            body_pages.push( post_body );
            post_body.find('.gallery-descriptions-wrap').remove();
            //Article on two pages
            const next_page = $profile('nav.pagination a.next').attr('href');
            if( next_page == "" | next_page == undefined )
                resolve(true);
            else
                ingest_post_body(hatch, next_page, body_pages).then(() => resolve(true));
        }).catch((err) => {
            resolve(false);
        });
    });
}

function ingest_post(hatch, uri, time) {
    return new Promise(function (resolve, reject){
        setTimeout(function(){
            const asset = new libingester.NewsArticle();
            let post_heading;
            let body_pages = [];
            let body = "";
            return libingester.util.fetch_html(uri).then(($profile) => {
                const base_uri = libingester.util.get_doc_base_uri($profile, uri);
                //Set title section
                const title = $profile('meta[property="og:title"]').attr('content');
                asset.set_title(title);

                asset.set_canonical_uri(uri);
                // Pull out the updated date
                const modified_date = $profile('meta[property="article:modified_time"]').attr('content');
                asset.set_last_modified_date(new Date(Date.parse(modified_date)));
                const section = $profile('meta[property="article:section"]').attr('content');
                asset.set_section(section);

                post_heading = $profile('.post-heading .container .row').children();
            })
            .then(() => {
                ingest_post_body(hatch, uri, body_pages).then((next) => {
                    for(const page of body_pages)
                        body += page.html();
                    const content = mustache.render(template.structure_template, {
                        post_heading: post_heading,
                        post_body: body
                    });
                    asset.set_document(content);
                    hatch.save_asset(asset);
                    resolve(true);
                })
            })
            .catch((err) => {
                resolve(false);
            });
        },time*1200);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load('http://all-that-is-interesting.com/feed', function(err, rss){
        let post_urls =  rss.items.map((datum) => datum.url); //recent posts
        let time = 0; //for delay
        Promise.all( post_urls.map((url) => ingest_post(hatch, url, time++)) ).then( () => hatch.finish() );
    });
}

main();
